
export type Resource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    annotations: Record<string, string>;
  };
  spec: Record<string, any>;
}

export type CreateInfrastructureOptions = {
  stackName: string;
  resources: Resource[];
}

export type DestroyInfrastructureOptions = {
  stackName: string;
}

export type GetInfrastructureStatusOptions = {
  stackName: string;
}

export type InfrastructureStatus = {
  status: "creating" | "running" | "stopped";
}

export abstract class IInfrastructureProvider {
  public abstract getProviderName(): Promise<string>;
  public abstract createInfrastructure(options: CreateInfrastructureOptions): Promise<void>;
  public abstract destroyInfrastructure(options: DestroyInfrastructureOptions): Promise<void>;
  public abstract getInfrastructureStatus(options: GetInfrastructureStatusOptions): Promise<InfrastructureStatus>;
}