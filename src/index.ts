#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import logger from './logger';
import { parse } from 'yaml'
import { AwsCloudFormationProvider } from './services/providers/aws-cloudformation-provider';

const program = new Command();
const providers = {
  'aws-cloudformation': new AwsCloudFormationProvider(),
}

program
  .version('0.0.1')
  .description('Open Development Platform Command Line Client');

const resourceCommand = program.command('resource');

resourceCommand
  .command('create')
  .requiredOption('-m, --manifest <manifest>', 'Resource manifest file')
  .action(async (options) => {
    // check if the manifest file exists
    if (!fs.existsSync(options.manifest)) {
      logger.error(`Manifest file not found: ${options.manifest}`);
      process.exit(1);
    }

    // load manifest yaml
    const manifest = parse(fs.readFileSync(options.manifest, 'utf8'));

    const provider = providers['aws-cloudformation'];
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
  .action(async (options) => {

    // Define stack parameters
    const stackName = 'odp-cloudformation-stack';
    
    const provider = providers['aws-cloudformation'];
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
  .action(async (options) => {

    // Define stack parameters
    const stackName = 'odp-cloudformation-stack';
    
    const provider = providers['aws-cloudformation'];
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