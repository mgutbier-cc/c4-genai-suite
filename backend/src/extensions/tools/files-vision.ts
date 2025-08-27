import { DynamicStructuredToolInput } from '@langchain/core/dist/tools';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { ChatContext, ChatMiddleware, ChatNextDelegate, GetContext } from 'src/domain/chat';
import { Extension, ExtensionEntity, ExtensionSpec } from 'src/domain/extensions';
import { User } from 'src/domain/users';
import { GetFiles, GetFilesResponse, matchExtension } from '../../domain/files';
import { I18nService } from '../../localization/i18n.service';

export class NamedDynamicStructuredTool extends DynamicStructuredTool {
  displayName: string;

  constructor({ displayName, ...toolInput }: DynamicStructuredToolInput & { displayName: string }) {
    super(toolInput);
    this.displayName = displayName;
  }
}

export type FilesVisionExtensionConfiguration = { fileNameExtensions: string[]; maxFiles: [] };

@Extension()
export class FilesVisionExtension implements Extension<FilesVisionExtensionConfiguration> {
  private logger = new Logger(this.constructor.name);

  constructor(
    @Inject(forwardRef(() => QueryBus))
    protected readonly queryBus: QueryBus,
    protected readonly i18n: I18nService,
  ) {}

  get spec(): ExtensionSpec {
    return {
      name: 'files-vision',
      group: 'files',
      groupWhitelist: ['files-42', 'files-conversation', 'files-whole'],
      title: this.i18n.t('texts.extensions.filesVision.title'),
      logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" xml:space="preserve"><linearGradient id="a" gradientUnits="userSpaceOnUse" x1="39.446" y1="801.241" x2="182.915" y2="944.694" gradientTransform="matrix(5.2695 0 0 -5.2695 -85.79 5100.133)"><stop offset=".05" stop-color="#07b0d3"/><stop offset=".229" stop-color="#4bb8cf"/><stop offset=".744" stop-color="#93ccb9"/><stop offset="1" stop-color="#a8d2af"/></linearGradient><path d="M533.1 834.4c-8.5-8.5-22.1-9.3-32.3-2.5-42.9 29.5-93.7 45.3-145.8 45.5-147.5 0-267.1-121.6-263.1-270.3 3.4-143.7 124.5-257.2 268.3-257.2h282.3c26.8 0 51 19.7 54.4 45.9 3.7 29.2-16.9 55.8-46.1 59.5-2.2.3-4.4.4-6.7.4H359.2c-77 0-142.9 60-145.8 136.8-2.9 80.8 62.1 148 142.5 148H639c193 0 355-152.6 358.4-345.7C1001 199.4 845.5 38 650.1 34.4c-1.7 0-3.4-.1-5.1-.1-60 0-136 14.4-204.5 65-12.3 8.2-13.6 27.2-2.9 37.8l29.3 29.3c8.5 8.5 22.1 9.3 32.3 2.5 42.9-29.5 93.7-45.3 145.8-45.5 147.5 0 267.1 121.6 263.1 269.9-3.4 143.7-124.5 257.2-268.3 257.2H357.6c-26.8 0-51-19.2-54.4-45.9-3.7-29.2 16.9-55.8 46.1-59.5 2.2-.3 4.4-.4 6.7-.4h284.8c77 0 142.9-60 145.8-136.8 2.9-80.8-62.1-148-142.5-148H360.9c-193-.3-354.5 152.4-358.4 345.4-3.6 195.4 151.9 356.8 347.3 360.4 1.7 0 3.4.1 5.1.1 60 0 136-14.4 204.5-65 12.3-8.2 13.6-27.2 2.9-37.8l-29.2-28.6z" fill="url(#a)"/></svg>',
      description: this.i18n.t('texts.extensions.filesVision.description'),
      type: 'tool',
      arguments: {
        fileNameExtensions: {
          type: 'array',
          title: this.i18n.t('texts.extensions.filesVision.fileTypes'),
          items: {
            title: '',
            type: 'string',
            required: true,
            enum: ['.png', '.jpg', '.jpeg', '.webp'],
          },
          default: ['.png', '.jpg', '.jpeg', '.webp'],
        },
        maxFiles: {
          type: 'number',
          title: this.i18n.t('texts.extensions.filesVision.maxFiles'),
          description: this.i18n.t('texts.extensions.filesVision.maxFilesHint'),
          required: true,
          default: 1,
          maximum: 2,
        },
      },
    };
  }

  getMiddlewares(user: User, extension: ExtensionEntity<FilesVisionExtensionConfiguration>): Promise<ChatMiddleware[]> {
    const middleware = {
      invoke: async (context: ChatContext, getContext: GetContext, next: ChatNextDelegate): Promise<any> => {
        const imageFiles = context.files
          ?.filter(({ fileName }) =>
            extension.values.fileNameExtensions.some((fileNameExtension) => matchExtension(fileName, fileNameExtension)),
          )
          ?.map(({ id }) => id);

        const commonArguments = {
          displayName: this.spec.title,
          name: extension.externalId,
          schema: z.object({}),
          returnDirect: false,
        };

        if (!imageFiles?.length) {
          // We explain to the LLM how the tools works, such that it can instruct the user
          context.tools.push(
            new NamedDynamicStructuredTool({
              ...commonArguments,
              description:
                'Call this tool to understand an image uploaded by the user. Currently the user did not upload an image. If you expect one, ask the user to upload it via the paperclip symbol.',
              func: async () => {},
            }),
          );
          return next(context);
        }

        const description = [
          'PRIORITY TOOL: The user has uploaded images that MUST be analyzed first.',
          'ALWAYS CALL THIS TOOL WHEN:',
          '* The user has uploaded any images',
          '* The user mentions or refers to any visual content',
          '* The user asks about content in images, photos, diagrams, or screenshots',
          '* You need to interpret or analyze visual information',
          '* The user asks you to describe what you see',
          'You MUST use this tool BEFORE responding to any query involving visual content.',
          'Do not attempt to describe or analyze images without calling this tool first.',
          'This tool provides AI vision capabilities to interpret the content of images.',
          `The user has uploaded ${imageFiles.length} image(s) that are ready for analysis.`,
        ].join('\n');

        context.tools.push(
          new NamedDynamicStructuredTool({
            ...commonArguments,
            description: description,
            func: async () => {
              const llm = context.llms[context.llm ?? ''];
              if (!llm) {
                return;
              }

              const matchingFiles: GetFilesResponse = await this.queryBus.execute(
                new GetFiles({
                  user,
                  bucketIdOrType: 'all',
                  page: 0,
                  pageSize: context.files?.length ?? 1,
                  files: imageFiles,
                  withContent: true,
                }),
              );

              const images = matchingFiles.files
                .flatMap(({ content }) => content ?? [])
                .filter(({ original }) => original)
                .map(({ type, buffer }) => `data:${type};base64,${buffer}`);

              if (images.length === 0) {
                return '';
              }

              const messages: Parameters<typeof ChatPromptTemplate.fromMessages>[0] = [
                {
                  role: 'human',
                  content: images.map((imageUrl) => ({
                    type: 'image_url',
                    image_url: imageUrl,
                  })),
                },
                ['user', context.input],
              ];

              try {
                const prompt = ChatPromptTemplate.fromMessages(messages);
                const outputParser = new StringOutputParser();
                const outputChain = prompt.pipe(llm).pipe(outputParser);
                const result = await outputChain.invoke({});
                return `Add the following content to your response without modification: ${result}`;
              } catch (err) {
                //TODO: for unsupported models there should be error handling
                this.logger.error('Error reading image', err);
                return '';
              }
            },
          }),
        );
        await next(context);
      },
    };

    return Promise.resolve([middleware]);
  }
}
