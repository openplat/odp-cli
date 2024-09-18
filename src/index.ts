#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import logger from './logger';
import { parse } from 'yaml'
import { AwsCloudFormationProvider } from './services/providers/aws-cloudformation-provider/index';
import { DockerComposeProvider } from './services/providers/docker-compose-provider/index';
import { InfrastructureProvider } from './types/infrastructure-provider';
import * as changeCase from "change-case";

// The stack name is the folder name where the command is executed
const stackName = process.cwd().split('/').pop() as string;

const resolveProvider = (provider: string) => {
  return provider ? providers[provider as string] : providers['aws-cloudformation'];
}

const program = new Command();
const providers: Record<string, InfrastructureProvider> = {
  'aws-cloudformation': new AwsCloudFormationProvider({ stackName, region: 'us-east-1' }),
  'docker-compose': new DockerComposeProvider({ stackName })
}


program
  .version('0.0.1')
  .description('Open Development Platform Command Line Client');

const resourceCommand = program.command('resource');

resourceCommand
  .command('create')
  .requiredOption('-m, --manifest <manifest>', 'Resource manifest file')
  .option('-p, --provider <provider>', 'Infrastructure provider')
  .action(async (options) => {
    // check if the manifest file exists
    if (!fs.existsSync(options.manifest)) {
      logger.error(`Manifest file not found: ${options.manifest}`);
      process.exit(1);
    }

    // load manifest yaml
    const manifest = parse(fs.readFileSync(options.manifest, 'utf8'));

    const provider: InfrastructureProvider = resolveProvider(options.provider);
    if (!provider) {
      logger.error('Provider not found');
      process.exit(1);
    }
    if (!stackName) {
      logger.error('Failed to resolve stack name');
      process.exit(1);
    }

    // create the infrastructure
    try {
      await provider.createInfrastructure({
        resources: [manifest]
      });
    } catch (error) {
      logger.error(`Failed to create resource: ${(error as Error).message}`);
      process.exit(1);
    }
  }
  );

resourceCommand
  .command('delete')
  .option('-p, --provider <provider>', 'Infrastructure provider')
  .action(async (options) => {

    const provider: InfrastructureProvider = resolveProvider(options.provider);
    if (!provider) {
      logger.error('Provider not found');
      process.exit(1);
    }
    if (!stackName) {
      logger.error('Failed to resolve stack name');
      process.exit(1);
    }

    // delete the infrastructure
    try {
      await provider.destroyInfrastructure();
    } catch (error) {
      logger.error(`Failed to delete resource: ${(error as Error).message}`);
      process.exit(1);
    }
  });

resourceCommand
  .command('status')
  .option('-p, --provider <provider>', 'Infrastructure provider')
  .action(async (options) => {

    const provider: InfrastructureProvider = resolveProvider(options.provider);
    if (!provider) {
      logger.error('Provider not found');
      process.exit(1);
    }
    if (!stackName) {
      logger.error('Failed to resolve stack name');
      process.exit(1);
    }

    // get the infrastructure status
    try {
      const status = await provider.getInfrastructureStatus();
      logger.info(`Resource status: ${status.status}`);
    } catch (error) {
      logger.error(`Failed to get resource status: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('export-env')
  .option('-p, --provider <provider>', 'Infrastructure provider')
  .requiredOption('-m, --manifest <manifest>', 'Resource manifest file')
  .action(async (options) => {
    const provider: InfrastructureProvider = resolveProvider(options.provider);
    if (!provider) {
      logger.error('Provider not found');
      process.exit(1);
    }
    if (!stackName) {
      logger.error('Failed to resolve stack name');
      process.exit(1);
    }

    // load manifest yaml
    const manifest = parse(fs.readFileSync(options.manifest, 'utf8'));
    // configure the infrastructure
    try {
      provider.getResourceOutputs(manifest).then((outputs) => {
        let envFileContent = '';
        for (const output of outputs) {
          const envName = changeCase.constantCase(`${manifest.metadata.name}_${output.key}`);
          envFileContent += `${envName}=${output.value}\n`;
          console.log(`${envName}=${output.value}`);
        }
        fs.writeFileSync('.env', envFileContent);
      });

    } catch (error) {
      logger.error(`Failed to configure resource: ${(error as Error).message}`);
      process.exit(1);
    }
  });


program.parse(process.argv);