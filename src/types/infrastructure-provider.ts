
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
  stackName: string;
  resources: Manifest[];
}

export type DestroyInfrastructureOptions = {
  stackName: string;
}

export type GetInfrastructureStatusOptions = {
  stackName: string;
}

export type InfrastructureStatus = {
  status: "creating" | "running" | "stopped" | "unknown";
}

export interface IInfrastructureProvider {
  getProviderName(): Promise<string>;
  createInfrastructure(options: CreateInfrastructureOptions): Promise<void>;
  destroyInfrastructure(options: DestroyInfrastructureOptions): Promise<void>;
  getInfrastructureStatus(options: GetInfrastructureStatusOptions): Promise<InfrastructureStatus>;
}
