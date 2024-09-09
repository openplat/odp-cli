import { CreateInfrastructureOptions, DestroyInfrastructureOptions, GetInfrastructureStatusOptions, IInfrastructureProvider, InfrastructureStatus, Resource } from "../../types/infrastructure-provider";
import { exec } from 'child_process';
import fs from 'fs';
import * as os from 'os';
import path from "path";
import { Scafflater } from "@scafflater/scafflater";

export class DockerComposeProvider extends IInfrastructureProvider {
  public async getProviderName(): Promise<string> {
    return "docker-compose";
  }

  private async isDockerComposeInstalled(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      exec('docker-compose --version', (error, stdout, stderr) => {
        if (error) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  private executeDockerComposeCommand(command: string, ...parameters: string[]): Promise<{ stdout: string, stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = exec(`docker compose ${parameters.join(' ')} ${command}`, (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr });
        } else {
          resolve({ stdout, stderr });
        }
      });

      // Print stdout and stderr
      child.stdout?.on('data', (data) => {
        console.log(data);
      });

      child.stderr?.on('data', (data) => {
        console.log(data);
      });
    });
  }

  private async renderDockerComposeFile(stackName: string, resources: Resource[]): Promise<string> {
    // create a temp directory
    const dir = fs.mkdtempSync(os.tmpdir() + '/');

    // Create the infrastructure using AWS CloudFormation
    // scaffold the resource
    const scafflater = new Scafflater({ source: 'githubClient', cacheStorage: 'tempDir' });
    await scafflater.init("https://github.com/openplat/template-docker-compose", {}, undefined, dir);

    for (const manifest of resources) {
      manifest.spec = manifest.spec ?? {};
      manifest.spec.stack = manifest.spec.stack ?  
        { ...manifest.spec.stack, name: manifest.spec.stack.name ?? stackName } :
        { name: stackName };
      await scafflater.runPartial('template-docker-compose', manifest.kind, manifest, dir);
    }

    return path.join(dir, `docker-compose.yaml`);
  }

  public async createInfrastructure(options: CreateInfrastructureOptions): Promise<void> {
    if (!(await this.isDockerComposeInstalled())) {
      throw new Error('Docker Compose is not installed.');
    }

    const filePath = await this.renderDockerComposeFile(options.stackName, options.resources);

    // Create the infrastructure using docker-compose
    await this.executeDockerComposeCommand('up', '-f', filePath);

  }

  public async destroyInfrastructure(options: DestroyInfrastructureOptions): Promise<void> {
    if (!(await this.isDockerComposeInstalled())) {
      throw new Error('Docker Compose is not installed.');
    }

    // Create the infrastructure using docker-compose
    await this.executeDockerComposeCommand('down', '-p', options.stackName);
  }

  public async getInfrastructureStatus(options: GetInfrastructureStatusOptions): Promise<InfrastructureStatus> {
    if (!(await this.isDockerComposeInstalled())) {
      throw new Error('Docker Compose is not installed.');
    }

    const { stdout, stderr } = await this.executeDockerComposeCommand('ps', '-p', options.stackName);

    // Parse the output to determine the status of each service
    const lines = stdout.split('\n').filter(line => line.trim() !== '').slice(1).map(line => line.split(/\s{2,}/));
    const status: InfrastructureStatus = { status: 'running' };

    if (lines.length === 0) {
      return { status: 'stopped' };
    } 
    
    if(lines.every(line => line[5].toUpperCase().endsWith('(RUNNING)'))) {
      return { status: 'running' };
    } else if(lines.every(line => line[5].toUpperCase().endsWith('(PAUSED)') || line[5].toUpperCase().endsWith('(STOPPED)'))) {
      return { status: 'stopped' };
    } else if(lines.every(line => line[5].toUpperCase().endsWith('(STARTING)'))) {
      return { status: 'creating' };
    }

    return { status: 'unknown' };
  }
}

