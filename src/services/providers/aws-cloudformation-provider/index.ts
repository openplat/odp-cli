import { Scafflater } from "@scafflater/scafflater";
import { CreateInfrastructureOptions, InfrastructureProvider, InfrastructureProviderOptions, InfrastructureStatus, Resource } from "../../../types/infrastructure-provider";
import { CloudFormationClient, CreateStackCommand, DeleteStackCommand, UpdateStackCommand, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import fs from 'fs';
import * as os from 'os';
import logger from "../../../logger";
import path from "path";
import { PostgresResource } from "./resources/postgres";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

export type AwsCloudFormationProviderOptions = InfrastructureProviderOptions & {
  region: string;
};

interface ParsedArn {
  partition: string;
  service: string;
  region: string;
  accountId: string;
  resourceType?: string;
  resourceId: string;
  resourceVersion?: string;
}

export class AwsCloudFormationProvider extends InfrastructureProvider {
  private availableResources: Resource[] = [];
  private region: string;
  private client: CloudFormationClient;

  constructor(options: AwsCloudFormationProviderOptions) {
    super(options);
    this.region = options.region ?? 'us-east-1';
    this.client = new CloudFormationClient({ region: this.region });
    this.availableResources.push(new PostgresResource(this));
  }

  public async getProviderName(): Promise<string> {
    return "aws-cloudformation";
  }

  public async listAvailableResources(): Promise<Resource[]> {
    return this.availableResources;
  }

  public async createInfrastructure(options: CreateInfrastructureOptions): Promise<void> {
    // create a temp directory
    const dir = fs.mkdtempSync(os.tmpdir() + '/');

    // Create the infrastructure using AWS CloudFormation
    // scaffold the resource
    const scafflater = new Scafflater({ source: 'githubClient', cacheStorage: 'tempDir' });
    await scafflater.init("https://github.com/openplat/template-aws-cloudformation", {}, undefined, dir);

    for (const manifest of options.resources) {
      await scafflater.runPartial('template-aws-cloudformation', manifest.kind, manifest, dir);
    }

    const bodyPath = path.join(dir, 'cloudformation-template.yaml');

    // Define stack parameters
    const templateBody = fs.readFileSync(bodyPath, 'utf8');

    // Create or update the stack
    try {
      await this.client.send(new CreateStackCommand({
        StackName: this.options.stackName,
        TemplateBody: templateBody,
        Capabilities: ['CAPABILITY_NAMED_IAM']
      }));
      logger.info('Creating resource...');
    } catch (error) {
      try {
        if ((error as Error).name === 'AlreadyExistsException') {
          await this.client.send(new UpdateStackCommand({
            StackName: this.options.stackName,
            TemplateBody: templateBody,
            Capabilities: ['CAPABILITY_NAMED_IAM']
          }));
          logger.info('Updating resource...');
        } else {
          logger.error(`Failed to create or update stack: ${(error as Error).message}`);
          throw error;
        }
      } catch (error) {
        if ((error as Error).message === 'No updates are to be performed.') {
          logger.info('No updates are to be performed');
        } else {
          logger.error(`Failed to create or update stack: ${(error as Error).message}`);
          throw error;
        }
      }
    }
  }

  public async destroyInfrastructure(): Promise<void> {
    // Delete the stack
    try {
      await this.client.send(new DeleteStackCommand({
        StackName: this.options.stackName
      }));
      logger.info('Deleting resource...');
    } catch (error) {
      logger.info(`Failed to delete stack: ${(error as Error).message}`);
      throw error;
    }
  }

  public async getInfrastructureStatus(): Promise<InfrastructureStatus> {
    try {
      const data = await this.client.send(new DescribeStacksCommand({ StackName: this.options.stackName }));
      if (data.Stacks && data.Stacks.length > 0) {
        switch (data.Stacks[0].StackStatus) {
          case 'CREATE_IN_PROGRESS':
          case 'UPDATE_IN_PROGRESS':
            return { status: 'creating' };
          case 'CREATE_COMPLETE':
          case 'UPDATE_COMPLETE':
            return { status: 'running' };
          default:
            return { status: 'stopped' };
        }
      } else {
        throw new Error(`Stack ${this.options.stackName} not found`);
      }
    } catch (error) {
      logger.error(`Error getting stack status: ${(error as Error).message}`);
      throw error;
    }
  }

  public async getStackOutput(): Promise<Record<string, string>> {
    try {
      const data = await this.client.send(new DescribeStacksCommand({ StackName: this.options.stackName }));
      if (data.Stacks && data.Stacks.length > 0) {
        const outputs = data.Stacks[0].Outputs;
        const outputValues: Record<string, string> = {};
        if (!outputs) {
          return outputValues;
        }

        for (const output of outputs) {
          const key: string = output.OutputKey as string;
          if (key) {
            outputValues[key] = output.OutputValue as string;
          }
        }
        return outputValues;
      } else {
        throw new Error(`Stack ${this.options.stackName} not found`);
      }
    } catch (error) {
      logger.error(`Error getting stack output: ${(error as Error).message}`);
      throw error;
    }
  }

  // Get Secret from AWS Secrets Manager
  public async getSecretValue(secretName: string): Promise<string> {
    // Create a Secrets Manager client
    const secretsManagerClient = new SecretsManagerClient({ region: this.region });

    try {
      const data = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: secretName }));
      return data.SecretString as string;
    } catch (error) {
      logger.error(`Error getting secret value: ${(error as Error).message}`);
      throw error;
    }
  }

  public parseArn(arn: string): ParsedArn {
    const arnRegex = /^arn:(?<partition>[^:]+):(?<service>[^:]+):(?<region>[^:]*):(?<accountId>[^:]*):((?<resourceType>[^:]*)[:/])?(?<resourceId>.+)$/;
    const match = arn.match(arnRegex);

    if (!match || !match.groups) {
      throw new Error(`Invalid ARN: ${arn}`);
    }
    

    const result :ParsedArn = {
      partition: match.groups.partition,
      service: match.groups.service,
      region: match.groups.region,
      accountId: match.groups.accountId,
      resourceType: match.groups.resourceType,
      resourceId: match.groups.resourceId,
    };

    if(result.resourceType === "secret"){
      const secretRegex = /^(?<name>.*)-(?<version>[^-]+)$/;
      const secretMatch = result.resourceId.match(secretRegex);
      if (!secretMatch || !secretMatch.groups) {
        throw new Error(`Invalid secret ARN: ${result.resourceId}`);
      }
      result.resourceId = secretMatch.groups.name;
      result.resourceVersion = secretMatch.groups.version;
    }

    return result;
  }
}