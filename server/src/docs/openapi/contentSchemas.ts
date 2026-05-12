import { arrayOf, ref } from "./helpers";

export const contentSchemas = {
  PromptCase: {
    type: "object",
    required: [
      "id",
      "title",
      "category",
      "modes",
      "recommendedSize",
      "tags",
      "promptTemplate",
      "promptSummary",
      "sourceLicense",
      "status",
      "featured",
      "sortOrder",
      "locale",
      "createdAt",
      "updatedAt"
    ],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      category: { type: "string" },
      modes: arrayOf({ type: "string", enum: ["image2image", "text2image"] }),
      recommendedSize: { type: "string" },
      tags: arrayOf({ type: "string" }),
      promptTemplate: { type: "string" },
      promptSummary: { type: "string" },
      thumbnailUrl: { type: "string", nullable: true },
      sourceUrl: { type: "string", nullable: true },
      sourceAuthor: { type: "string", nullable: true },
      sourceLicense: { type: "string", enum: ["CC BY 4.0", "original", "internal"] },
      sourceRepo: { type: "string", nullable: true },
      popularity: { type: "object", additionalProperties: true },
      status: { type: "string", enum: ["draft", "published", "hidden", "archived"] },
      featured: { type: "boolean" },
      sortOrder: { type: "integer" },
      locale: { type: "string", enum: ["zh-CN", "en-US"] },
      createdBy: { type: "string", nullable: true },
      updatedBy: { type: "string", nullable: true },
      createdAt: { type: "integer" },
      updatedAt: { type: "integer" }
    },
    additionalProperties: false
  },
  PromptCaseListItem: {
    type: "object",
    required: [
      "id",
      "title",
      "category",
      "modes",
      "recommendedSize",
      "tags",
      "promptSummary",
      "sourceLicense",
      "featured",
      "sortOrder",
      "locale"
    ],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      category: { type: "string" },
      modes: arrayOf({ type: "string", enum: ["image2image", "text2image"] }),
      recommendedSize: { type: "string" },
      tags: arrayOf({ type: "string" }),
      promptSummary: { type: "string" },
      thumbnailUrl: { type: "string", nullable: true },
      sourceAuthor: { type: "string", nullable: true },
      sourceLicense: { type: "string", enum: ["CC BY 4.0", "original", "internal"] },
      sourceRepo: { type: "string", nullable: true },
      featured: { type: "boolean" },
      sortOrder: { type: "integer" },
      locale: { type: "string", enum: ["zh-CN", "en-US"] }
    },
    additionalProperties: false
  },
  PromptCaseFacet: {
    type: "object",
    required: ["value", "count"],
    properties: {
      value: { type: "string" },
      count: { type: "integer", minimum: 0 }
    },
    additionalProperties: false
  },
  PromptCasePageInfo: {
    type: "object",
    required: ["nextCursor", "hasMore", "limit"],
    properties: {
      nextCursor: { type: "string", nullable: true },
      hasMore: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 100 }
    },
    additionalProperties: false
  },
  PromptCaseFacets: {
    type: "object",
    required: ["categories", "sizes", "modes"],
    properties: {
      categories: arrayOf(ref("PromptCaseFacet")),
      sizes: arrayOf(ref("PromptCaseFacet")),
      modes: arrayOf(ref("PromptCaseFacet"))
    },
    additionalProperties: false
  },
  PromptCaseInput: {
    type: "object",
    required: ["title", "category", "modes", "recommendedSize", "promptTemplate", "promptSummary"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120 },
      category: { type: "string", minLength: 1, maxLength: 120 },
      modes: {
        type: "array",
        minItems: 1,
        maxItems: 2,
        items: { type: "string", enum: ["image2image", "text2image"] }
      },
      recommendedSize: { type: "string", minLength: 1, maxLength: 40 },
      tags: {
        type: "array",
        maxItems: 20,
        items: { type: "string", minLength: 1, maxLength: 40 },
        default: []
      },
      promptTemplate: { type: "string", minLength: 1, maxLength: 4000 },
      promptSummary: { type: "string", minLength: 1, maxLength: 800 },
      thumbnailUrl: { type: "string", nullable: true, maxLength: 1000 },
      sourceUrl: { type: "string", nullable: true, maxLength: 1000 },
      sourceAuthor: { type: "string", nullable: true, maxLength: 1000 },
      sourceLicense: {
        type: "string",
        enum: ["CC BY 4.0", "original", "internal"],
        default: "internal"
      },
      sourceRepo: { type: "string", nullable: true, maxLength: 1000 },
      popularity: { type: "object", additionalProperties: true, default: {} },
      status: {
        type: "string",
        enum: ["draft", "published", "hidden", "archived"],
        default: "draft"
      },
      featured: { type: "boolean", default: false },
      sortOrder: { type: "integer", minimum: 0, maximum: 1000000, default: 0 },
      locale: { type: "string", enum: ["zh-CN", "en-US"], default: "zh-CN" }
    },
    additionalProperties: false
  },
  Announcement: {
    type: "object",
    required: ["id", "title", "contentPreview", "targetAudience", "createdAt"],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      content: { type: "string", description: "详情或 sysadmin 列表中返回完整正文。" },
      contentPreview: { type: "string" },
      targetAudience: { type: "string", enum: ["all", "admins"] },
      status: { type: "string", enum: ["draft", "published", "archived"] },
      publishedAt: { type: "integer", nullable: true },
      createdAt: { type: "integer" },
      updatedAt: { type: "integer" },
      isRead: { type: "boolean" },
      createdBy: { type: "string", nullable: true },
      updatedBy: { type: "string", nullable: true }
    },
    additionalProperties: true
  }
};
