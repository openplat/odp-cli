#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import logger from './logger';
import { parse } from 'yaml'
import { AwsCloudFormationProvider } from './services/providers/aws-cloudformation-provider';
import { DockerComposeProvider } from './services/providers/docker-compose-provider';
import { IInfrastructureProvider } from './types/infrastructure-provider';

const program = new Command();
const providers: Record<string, IInfrastructureProvider> = {
  'aws-cloudformation': new AwsCloudFormationProvider(),
  'docker-compose': new DockerComposeProvider()
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

    const provider: IInfrastructureProvider = options.provider ? providers[options.provider as string] : providers['aws-cloudformation'];
    if (!provider) {
      logger.error('Provider not found');
      process.exit(1);
    }

    // create the infrastructure
    try {
      await provider.createInfrastructure({
        stackName: 'odp-cloudformation-stack',
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

    // Define stack parameters
    const stackName = 'odp-cloudformation-stack';

    const provider: IInfrastructureProvider = options.provider ? providers[options.provider as string] : providers['aws-cloudformation'];
    if (!provider) {
      logger.error('Provider not found');
      process.exit(1);
    }

    // delete the infrastructure
    try {
      await provider.destroyInfrastructure({
        stackName
      });
    } catch (error) {
      logger.error(`Failed to delete resource: ${(error as Error).message}`);
      process.exit(1);
    }
  });

resourceCommand
  .command('status')
  .option('-p, --provider <provider>', 'Infrastructure provider')
  .action(async (options) => {

    // Define stack parameters
    const stackName = 'odp-cloudformation-stack';

    const provider: IInfrastructureProvider = options.provider ? providers[options.provider as string] : providers['aws-cloudformation'];
    if (!provider) {
      logger.error('Provider not found');
      process.exit(1);
    }

    // get the infrastructure status
    try {
      const status = await provider.getInfrastructureStatus({
        stackName
      });
      logger.info(`Resource status: ${status.status}`);
    } catch (error) {
      logger.error(`Failed to get resource status: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);