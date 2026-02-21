import OpenAI from "@openai/openai";
import { Filter } from "bad-words";

import { config } from "./config.ts";

const filter = new Filter();

export interface ModerationCategories {
	[key: string]: boolean;
}

export interface ModerationCategoryScores {
	[key: string]: number;
}

export interface ModerationResult {
	flagged: boolean;
	categories?: ModerationCategories;
	categoryScores?: ModerationCategoryScores;
	error?: string;
}

export function initModeration() {
	let openai: OpenAI | undefined;
	if (config.useOpenAIModeration) {
		if (config.openAiApiKey) {
			openai = new OpenAI({ apiKey: config.openAiApiKey });
			console.log("OpenAI moderation enabled");
		} else {
			console.error("OPENAI_API_KEY not provided, OpenAI moderation disabled");
		}
	}

	return async function moderateContent(text: string): Promise<ModerationResult> {
		if (filter.isProfane(text)) {
			return { flagged: true };
		}

		if (!config.useOpenAIModeration || !openai) return { flagged: false };

		try {
			const moderation = await openai.moderations.create({
				model: "omni-moderation-latest",
				input: text,
			});

			return {
				flagged: moderation.results[0].flagged,
				categories: moderation.results[0].categories as unknown as ModerationCategories,
				categoryScores: moderation.results[0].category_scores as unknown as ModerationCategoryScores,
			};
		} catch (error) {
			console.error("OpenAI moderation error:", error);
			return { flagged: false, error: (error as Error).message };
		}
	};
}
