#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { Scafflater } from '@scafflater/scafflater';
import { parse } from 'yaml'
import { CloudFormationClient, CreateStackCommand, DeleteStackCommand, UpdateStackCommand } from "@aws-sdk/client-cloudformation";
import * as os from 'os';

const program = new Command();

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
      console.error(chalk.red(`Manifest file not found: ${options.manifest}`));
      process.exit(1);
    }

    // load manifest yaml
    const manifest = parse(fs.readFileSync(options.manifest, 'utf8'));

    // create a temp directory
    const dir = fs.mkdtempSync(os.tmpdir() + '/');

    // scaffold the resource
    const scafflater = new Scafflater({ source: 'githubClient', cacheStorage: 'tempDir' });
    await scafflater.init("https://github.com/openplat/template-aws-cloudformation", {}, undefined, dir);
    await scafflater.runPartial('template-aws-cloudformation', 'Postgres', manifest, dir);

    const bodyPath = `${dir}/cloudformation-template.yaml`;

    // create a CloudFormation client
    const client = new CloudFormationClient({ region: 'us-east-1' });

    // Define stack parameters
    const stackName = 'odp-cloudformation-stack';
    const templateBody = fs.readFileSync(bodyPath, 'utf8');

    // Create or update the stack
    try {
      await client.send(new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
        Capabilities: ['CAPABILITY_NAMED_IAM']
      }));
      console.log(chalk.green('Creating resource...'));
    } catch (error) {
      try {
        if ((error as Error).name === 'AlreadyExistsException') {
          await client.send(new UpdateStackCommand({
            StackName: stackName,
            TemplateBody: templateBody,
            Capabilities: ['CAPABILITY_NAMED_IAM']
          }));
          console.log(chalk.green('Updating resource...'));
        } else {
          console.error(chalk.red(`Failed to create or update stack: ${(error as Error).message}`));
          process.exit(1);
        }
      } catch (error) {
        if((error as Error).message === 'No updates are to be performed.') {
          console.log(chalk.green('No updates are to be performed'));
        }else {
          console.error(chalk.red(`Failed to create or update stack: ${(error as Error).message}`));
          process.exit(1);
        }
      }
    }

    console.log(chalk.green(`Manifest
    ${options.manifest}`));
  }
  );

resourceCommand
  .command('delete')
  .action(async (options) => {

    // Define stack parameters
    const stackName = 'odp-cloudformation-stack';
    // create a CloudFormation client
    const client = new CloudFormationClient({ region: 'us-east-1' });

    // Delete the stack
    try {
      await client.send(new DeleteStackCommand({
        StackName: stackName
      }));
      console.log(chalk.green('Deleting resource...'));
    } catch (error) {
      console.error(chalk.red(`Failed to delete stack: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);