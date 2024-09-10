import { Scafflater } from "@scafflater/scafflater";
import { CreateInfrastructureOptions, DestroyInfrastructureOptions, GetInfrastructureStatusOptions, IInfrastructureProvider, InfrastructureStatus } from "../../types/infrastructure-provider";
import { CloudFormationClient, CreateStackCommand, DeleteStackCommand, UpdateStackCommand, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import fs from 'fs';
import * as os from 'os';
import logger from "../../logger";
import path from "path";

export class AwsCloudFormationProvider implements IInfrastructureProvider {
  public async getProviderName(): Promise<string> {
    return "aws-cloudformation";
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

    // create a CloudFormation client
    const client = new CloudFormationClient({ region: 'us-east-1' });

    // Define stack parameters
    const templateBody = fs.readFileSync(bodyPath, 'utf8');

    // Create or update the stack
    try {
      await client.send(new CreateStackCommand({
        StackName: options.stackName,
        TemplateBody: templateBody,
        Capabilities: ['CAPABILITY_NAMED_IAM']
      }));
      logger.info('Creating resource...');
    } catch (error) {
      try {
        if ((error as Error).name === 'AlreadyExistsException') {
          await client.send(new UpdateStackCommand({
            StackName: options.stackName,
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

  public async destroyInfrastructure(options: DestroyInfrastructureOptions): Promise<void> {

    // create a CloudFormation client
    const client = new CloudFormationClient({ region: 'us-east-1' });

    // Delete the stack
    try {
      await client.send(new DeleteStackCommand({
        StackName: options.stackName
      }));
      logger.info('Deleting resource...');
    } catch (error) {
      logger.info(`Failed to delete stack: ${(error as Error).message}`);
      throw error;
    }
  }

  public async getInfrastructureStatus(options: GetInfrastructureStatusOptions): Promise<InfrastructureStatus> {
    const client = new CloudFormationClient({ region: 'us-east-1' });
    try {
      const data = await client.send(new DescribeStacksCommand({ StackName: options.stackName }));
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
        throw new Error(`Stack ${options.stackName} not found`);
      }
    } catch (error) {
      logger.error(`Error getting stack status: ${(error as Error).message}`);
      throw error;
    }
  }
}