import { parse } from "yaml";
import { DockerComposeProvider } from "..";
import { InfrastructureProvider, Resource, Manifest, ResourceOutput, ResourceOutputValue } from "../../../../types/infrastructure-provider";

export type DatabaseCredentials = {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

export class PostgresResource implements Resource {
  kind: string = "Postgres";
  description: string = "A postgres database using RDS";
  outputs: ResourceOutput[] = [{
    "key": "connectionString",
    "description": "The connection string to connect to the database"
  }, {
    "key": "username",
    "description": "The username to connect to the database"
  }, {
    "key": "password",
    "description": "The password to connect to the database"
  }, {
    "key": "dbname",
    "description": "The name of the database"
  }, {
    "key": "engine",
    "description": "The engine of the database"
  }, {
    "key": "host",
    "description": "The host of the database"
  }, {
    "key": "port",
    "description": "The port of the database"
  }];
  private provider: DockerComposeProvider;

  constructor(provider: InfrastructureProvider) {
    this.provider = provider as DockerComposeProvider;
    if (!this.provider) {
      throw new Error('Provider must be an instance of DockerComposeProvider');
    }
  }

  async getOutputs(): Promise<ResourceOutput[]> {
    return this.outputs;
  }

  buildConnectionString(credentials: DatabaseCredentials): string {
    return `postgresql://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.dbname}`;
  }

  async getOutputValues(manifest: Manifest): Promise<ResourceOutputValue[]> {
    const providerOutputs = await this.provider.getStackOutput();
    
    const outputName = `${manifest.metadata.name}Secret`;

    if (!providerOutputs.dockerComposeFile) {
      throw new Error(`Docker Compose file not found for resource ${manifest.metadata.name}`);
    }

    const dockerComposeFile = parse(providerOutputs.dockerComposeFile);

    const service = dockerComposeFile.services[`${manifest.metadata.name}Db`];

    const result = [];
    result.push({
      key: 'username',
      description: 'The username to connect to the database',
      value: service.environment.POSTGRES_USER
    });
    result.push({
      key: 'password',
      description: 'The password to connect to the database',
      value: service.environment.POSTGRES_PASSWORD
    });
    result.push({
      key: 'dbname',
      description: 'The name of the database',
      value: service.environment.POSTGRES_DB
    });
    result.push({
      key: 'engine',
      description: 'The engine of the database',
      value: 'postgres'
    });
    result.push({
      key: 'host',
      description: 'The host of the database',
      value: service.environment.POSTGRES_HOST ?? 'localhost'
    });


    let port = '5432'
    for (const p of service.ports) {
      if (p.endsWith('5432')) {
        port = p.split(':')[0];
        break;
      }
    }
    result.push({
      key: 'port',
      description: 'The port of the database',
      value: port
    });

    result.push({
      key: 'connectionString',
      description: 'The connection string to connect to the database',
      value: this.buildConnectionString({
        username: service.environment.POSTGRES_USER,
        password: service.environment.POSTGRES_PASSWORD,
        host: service.environment.POSTGRES_HOST ?? 'localhost',
        port: parseInt(port),
        dbname: service.environment.POSTGRES_DB
      })
    });

    return result;
  }
}