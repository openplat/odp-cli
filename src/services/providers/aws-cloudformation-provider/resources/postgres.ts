import { AwsCloudFormationProvider } from "..";
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
  private provider: AwsCloudFormationProvider;

  constructor(provider: InfrastructureProvider) {
    this.provider = provider as AwsCloudFormationProvider;
    if (!this.provider) {
      throw new Error('Provider must be an instance of AwsCloudFormationProvider');
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

    if (!providerOutputs[outputName]) {
      throw new Error(`Ouput secret not found for resource ${manifest.metadata.name}`);
    }

    const secretValue = JSON.parse(
      await this.provider.getSecretValue(
        this.provider.parseArn(providerOutputs[outputName]).resourceId));

    const result = [];
    for (const output of this.outputs) {
      if (output.key === 'connectionString') {
        result.push({
          key: output.key,
          description: output.description,
          value: this.buildConnectionString(secretValue)
        });
        continue;
      }
      result.push({
        key: output.key,
        description: output.description,
        value: secretValue[output.key]
      });
    }
    return result;

  }
}