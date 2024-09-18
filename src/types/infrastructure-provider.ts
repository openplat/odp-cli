
export type Manifest = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    annotations: Record<string, string>;
  };
  spec: Record<string, any>;
}

export type CreateInfrastructureOptions = {
  resources: Manifest[];
}

export type InfrastructureStatus = {
  status: "creating" | "running" | "stopped" | "unknown";
}

export type GetResourceOutputOptions = {

}

export type ResourceOutput = {
  key: string;
  description: string;
}

export type ResourceOutputValue = ResourceOutput & {
  value: string;
}

export type Resource = {
  kind: string;
  description: string;

  getOutputs(): Promise<ResourceOutput[]>;
  getOutputValues(manifest: Manifest): Promise<ResourceOutputValue[]>;
}

export type InfrastructureProviderOptions = {
  stackName: string;
}

export abstract class InfrastructureProvider {
  options: InfrastructureProviderOptions

  constructor(options: InfrastructureProviderOptions) {
    this.options = options;
  };

  abstract getProviderName(): Promise<string>;
  abstract createInfrastructure(options: CreateInfrastructureOptions): Promise<void>;
  abstract destroyInfrastructure(): Promise<void>;
  abstract getInfrastructureStatus(): Promise<InfrastructureStatus>;
  abstract listAvailableResources(): Promise<Resource[]>;
  abstract getStackOutput(): Promise<Record<string, string>>;

  public async getResourceOutputs(manifest: Manifest): Promise<ResourceOutputValue[]> {
    const resource = (await this.listAvailableResources()).find(r => r.kind === manifest.kind);
    if (!resource) {
      throw new Error(`Resource ${manifest.kind} not found`);
    }

    return resource
      .getOutputValues(manifest);
  }
}
