import { Embeddings } from '@langchain/core/embeddings';
import { ChatMiddleware, ExtensionUserArgumentValues } from '../chat';
import { ChatSuggestion } from '../shared';
import { User } from '../users';
import 'reflect-metadata';

export type ExtensionConfiguration = Record<string, any>;

export interface ConfigurationModel {
  id: number;

  name: string;

  description: string;

  enabled: boolean;

  agentName?: string;

  chatFooter?: string;

  chatSuggestions?: ChatSuggestion[];

  executorEndpoint?: string;

  executorHeaders?: string;

  userGroupsIds: string[];

  extensions?: ConfiguredExtension[];
}

export interface ConfigurationUserValuesModel {
  id: number;
  values: { [id: string]: ExtensionConfiguration };
  isDefault: boolean;
}

export interface ExtensionArgumentBase {
  type: ExtensionArgumentType;

  title: string;

  description?: string;

  required?: boolean;

  showInList?: boolean;

  documentationUrl?: string;
}

export const EXTENSION_STRING_ARGUMENT_FORMATS = ['input', 'textarea', 'password', 'select', 'date', 'c4-ui'] as const;

export type ExtensionStringArgumentFormat = (typeof EXTENSION_STRING_ARGUMENT_FORMATS)[number];

export interface ExtensionStringArgument extends ExtensionArgumentBase {
  type: 'string';

  format?: ExtensionStringArgumentFormat;

  enum?: string[];

  default?: string;
}

export interface ExtensionObjectArgument extends ExtensionArgumentBase {
  type: 'object';

  properties: { [name: string]: ExtensionArgument };
}

export interface ExtensionArrayArgument extends ExtensionArgumentBase {
  type: 'array';

  items: ExtensionArgument;

  uniqueItems?: boolean;

  default?: any[];
}

export const EXTENSION_NUMBER_ARGUMENT_FORMATS = ['input', 'slider', 'bucket'] as const;

export type ExtensionNumberArgumentFormat = (typeof EXTENSION_NUMBER_ARGUMENT_FORMATS)[number];

export interface ExtensionNumberArgument extends ExtensionArgumentBase {
  type: 'number';

  format?: ExtensionNumberArgumentFormat;

  minimum?: number;

  maximum?: number;

  multipleOf?: number;

  default?: number;
}

export const EXTENSION_BOOLEAN_ARGUMENT_FORMATS = ['toggle'] as const;

export type ExtensionBooleanArgumentFormat = (typeof EXTENSION_BOOLEAN_ARGUMENT_FORMATS)[number];

export interface ExtensionBooleanArgument extends ExtensionArgumentBase {
  type: 'boolean';

  format?: ExtensionBooleanArgumentFormat;

  default?: boolean;
}

export type ExtensionArgument =
  | ExtensionArrayArgument
  | ExtensionObjectArgument
  | ExtensionStringArgument
  | ExtensionNumberArgument
  | ExtensionBooleanArgument;

export const EXTENSION_ARGUMENT_TYPES = ['string', 'number', 'boolean', 'object', 'array'] as const;

export type ExtensionArgumentType = (typeof EXTENSION_ARGUMENT_TYPES)[number];

export const EXTENSION_TYPES = ['tool', 'llm', 'other'] as const;

export type ExtensionType = (typeof EXTENSION_TYPES)[number];

export interface ExtensionSpec {
  // The unique name of the extension.
  name: string;

  // group of pairwise incompatible extensions (includes the extension with itself)
  group?: string;

  // group of exceptions to the group incompatible extensions
  groupWhitelist?: string[];

  title: string;

  description: string;

  // The logo as SVG.
  logo?: string;

  type: ExtensionType;

  arguments: { [name: string]: ExtensionArgument };

  userArguments?: { [key: string]: ExtensionArgument };

  triggers?: string[];
}

export interface ExtensionEmbeddings {
  // The embedding.
  embeddings: Embeddings;

  // The optional name.
  name?: string;
}

export type ExtensionState = {
  [param: string]: any;
  changed?: boolean;
  changes?: Record<string, any>[];
};

type ExtensionEntity = {
  id: number;
  enabled?: boolean;
  values: ExtensionConfiguration;
  state?: ExtensionState;
  configurableArguments?: ExtensionObjectArgument;
};

export class ConfiguredExtension {
  private constructor(
    private readonly entity: ExtensionEntity,
    private readonly extension: Extension,
    public readonly spec: ExtensionSpec,
  ) {}

  get enabled(): boolean {
    return this.entity.enabled ?? false;
  }

  get id(): number {
    return this.entity.id;
  }

  set id(id: number) {
    this.entity.id = id;
  }

  get testable(): boolean {
    return !!this.extension.test;
  }

  get dynamic(): boolean {
    return !!this.extension.buildSpec;
  }

  get values(): ExtensionConfiguration {
    return this.entity.values;
  }

  get changed(): boolean {
    return this.entity.state?.changed ?? false;
  }

  get configurableArguments(): ExtensionObjectArgument | undefined {
    return this.entity.configurableArguments;
  }

  get fixedValues(): Partial<ExtensionConfiguration> {
    return this.extension.fixedValues ?? {};
  }

  async getChunks(documentUri: string, chunkUris: string[]): Promise<string[] | undefined> {
    return this.extension.getChunks?.(this.entity.values, documentUri, chunkUris);
  }

  getMiddlewares(
    user: User,
    userArgumentValues?: ExtensionUserArgumentValues,
    userConfiguredValues?: ExtensionUserArgumentValues,
  ): Promise<ChatMiddleware[]> {
    if (!this.extension.getMiddlewares) {
      return Promise.resolve([]);
    }

    const values = {
      ...(this.entity.values ?? {}),
      ...(userConfiguredValues ?? {}),
    };

    return this.extension.getMiddlewares(user, values, this.entity.id, userArgumentValues);
  }

  public static async create(
    this: void,
    extension: Extension,
    entity: ExtensionEntity,
    throwOnError: boolean = false,
    forceRebuild: boolean = false,
  ) {
    entity.state = entity.state ?? {};
    const spec = extension.buildSpec
      ? await extension.buildSpec(entity.values, entity.state, throwOnError, forceRebuild)
      : extension.spec;
    return new ConfiguredExtension(entity, extension, spec);
  }

  public static createInitial(this: void, extension: Extension) {
    const spec = extension.spec;
    return new ConfiguredExtension({ id: 0, values: {}, state: {} }, extension, spec);
  }
}

export interface Extension {
  // the default spec
  spec: ExtensionSpec;

  // for dynamic specs
  buildSpec?(
    values: ExtensionConfiguration,
    state: ExtensionState,
    throwOnError: boolean,
    forceRebuild: boolean,
  ): Promise<ExtensionSpec>;

  //TODO: instead of passing configuration to every method call, make the extensions stateful
  getChunks?(configuration: ExtensionConfiguration, documentUri: string, chunkUris: string[]): Promise<string[]>;

  fixedValues?: Partial<ExtensionConfiguration>;

  test?(configuration: ExtensionConfiguration): Promise<any>;

  getMiddlewares?(
    user: User,
    configuration: ExtensionConfiguration,
    id: number,
    userArgumentValues?: ExtensionUserArgumentValues,
  ): Promise<ChatMiddleware[]>;

  getEmbedding?(user: User, configuration: ExtensionConfiguration): Promise<ExtensionEmbeddings>;
}

export const EXTENSION_METADATA = 'EXTENSION';

export const Extension = (): ClassDecorator => {
  return (target: object) => {
    Reflect.defineMetadata(EXTENSION_METADATA, true, target);
  };
};
