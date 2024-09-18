import { CreateInfrastructureOptions, InfrastructureProvider, InfrastructureProviderOptions, InfrastructureStatus, Manifest, Resource } from "../../../types/infrastructure-provider";
import { exec } from 'child_process';
import fs from 'fs';
import path from "path";
import { Scafflater, TemplateInitialized } from "@scafflater/scafflater";
import { PostgresResource } from "./resources/postgres";

export class DockerComposeProvider extends InfrastructureProvider {
  private availableResources: Resource[] = [];
  
  constructor(options: InfrastructureProviderOptions) {
    super(options);
    this.availableResources.push(new PostgresResource(this));
  }

  public async getProviderName(): Promise<string> {
    return "docker-compose";
  }

  public async listAvailableResources(): Promise<Resource[]> {
    return Promise.resolve(this.availableResources);
  }

  public async getStackOutput(): Promise<Record<string, string>> {
    const dockerComposeFile = path.join(this.getOplatPath(), 'docker-compose.yaml');
    if (!fs.existsSync('.oplat')) {
      throw new Error('Docker Compose infrastructure not found. Run `oplat resource create -p docker-compose -m <manifest>` to create the infrastructure.');
    }

    return Promise.resolve({ dockerComposeFile: fs.readFileSync(dockerComposeFile, 'utf8') });

  }

  private getOplatPath(): string {
    // create a temp directory
    const oplatPath = path.resolve(`./.oplat`);
    if(!fs.existsSync(oplatPath)) {
      fs.mkdirSync(oplatPath);
    }

    return oplatPath;
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

  private async renderDockerComposeFile(stackName: string, resources: Manifest[]): Promise<string> {
    // create a temp directory
    const oplatPath = this.getOplatPath();

    // Create the infrastructure using AWS CloudFormation
    // scaffold the resource
    const scafflater = new Scafflater({ source: 'githubClient', cacheStorage: 'tempDir' });
    try {
        await scafflater.init("https://github.com/openplat/template-docker-compose", {}, undefined, oplatPath);
    } catch (error) {
      if(error instanceof TemplateInitialized){
        console.log('Template already initialized');
      }else{
        throw error;
      }
    }

    for (const manifest of resources) {
      manifest.spec = manifest.spec ?? {};
      manifest.spec.stack = manifest.spec.stack ?
        { ...manifest.spec.stack, name: manifest.spec.stack.name ?? stackName } :
        { name: stackName };
      await scafflater.runPartial('template-docker-compose', manifest.kind, manifest, oplatPath);
    }

    return path.join(oplatPath, `docker-compose.yaml`);
  }

  public async createInfrastructure(options: CreateInfrastructureOptions): Promise<void> {
    if (!(await this.isDockerComposeInstalled())) {
      throw new Error('Docker Compose is not installed.');
    }

    const filePath = await this.renderDockerComposeFile(this.options.stackName, options.resources);

    // Create the infrastructure using docker-compose
    await this.executeDockerComposeCommand('up', '-f', filePath);

  }

  public async destroyInfrastructure(): Promise<void> {
    if (!(await this.isDockerComposeInstalled())) {
      throw new Error('Docker Compose is not installed.');
    }

    // Create the infrastructure using docker-compose
    await this.executeDockerComposeCommand('down', '-p', this.options.stackName);
  }

  public async getInfrastructureStatus(): Promise<InfrastructureStatus> {
    if (!(await this.isDockerComposeInstalled())) {
      throw new Error('Docker Compose is not installed.');
    }

    const { stdout, stderr } = await this.executeDockerComposeCommand('ps', '-p', this.options.stackName);

    // Parse the output to determine the status of each service
    const lines = stdout.split('\n').filter(line => line.trim() !== '').slice(1).map(line => line.split(/\s{2,}/));
    const status: InfrastructureStatus = { status: 'running' };

    if (lines.length === 0) {
      return { status: 'stopped' };
    }

    if (lines.every(line => line[5].toUpperCase().endsWith('(RUNNING)') || line[5].toUpperCase().endsWith('(HEALTHY)'))) {
      return { status: 'running' };
    } else if (lines.every(line => line[5].toUpperCase().endsWith('(PAUSED)') || line[5].toUpperCase().endsWith('(STOPPED)'))) {
      return { status: 'stopped' };
    } else if (lines.every(line => line[5].toUpperCase().endsWith('(STARTING)'))) {
      return { status: 'creating' };
    }

    return { status: 'unknown' };
  }
}

