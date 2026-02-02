import { iZombies } from "./levels_io.ts";

import type { decodeFile } from "./levels_io.ts";

type Clone = ReturnType<typeof decodeFile>;

function hasAllRequiredProperties(clone: Clone): boolean {
	const requiredProperties = ["plants", "music", "sun", "name", "lfValue", "stripeCol"];

	for (const prop of requiredProperties) {
		if (!(prop in clone)) {
			return false;
		}
	}

	return true;
}

function max3PlantsIn1Tile(clone: Clone): boolean {
	const MAX_PLANTS_PER_TILE = 3;
	const plantsPerTile: { [key: string]: number } = {};

	for (const plant of clone.plants) {
		const tileKey = `${plant.plantRow}-${plant.plantCol}`;
		plantsPerTile[tileKey] = (plantsPerTile[tileKey] || 0) + 1;

		if (plantsPerTile[tileKey] > MAX_PLANTS_PER_TILE) {
			return false;
		}
	}

	return true;
}

function maxLfLength7(clone: Clone): boolean {
	const MAX_LF_LENGTH = 7;
	return clone.lfValue.length <= MAX_LF_LENGTH;
}

function maxSun9990(clone: Clone): boolean {
	const MAX_SUN = 9990;
	return clone.sun <= MAX_SUN;
}

function validMusic(clone: Clone): boolean {
	const allowedMusicTracks = [
		"Cerebrawl", // the only valid music for now
	];

	return allowedMusicTracks.includes(clone.music);
}

function validStripeCol(clone: Clone): boolean {
	const MIN_STRIPE_COL = 3;
	const MAX_STRIPE_COL = 8;
	return clone.stripeCol !== undefined && clone.stripeCol >= MIN_STRIPE_COL && clone.stripeCol <= MAX_STRIPE_COL;
}

function hasValidPlantCount(clone: Clone): boolean {
	if (clone.lfValue[3] === 2) {
		// if this is true, its a water level
		let MAX_PLANTS = 108; // assuming flower pot/lilypad + pumpkin filling up the screen
		const extraStripeCols = clone.stripeCol ? clone.stripeCol - 1 : 2;
		for (let i = 0; i < extraStripeCols; i++) {
			MAX_PLANTS += 6;
		}
		return clone.plants.length <= MAX_PLANTS;
	} else {
		let MAX_PLANTS = 90; // assuming flower pot + pumpkin filling up the screen
		const extraStripeCols = clone.stripeCol ? clone.stripeCol - 1 : 2;
		for (let i = 0; i < extraStripeCols; i++) {
			MAX_PLANTS += 5;
		}
		return clone.plants.length <= MAX_PLANTS;
	}
}

function noPlantsAfterStripe(clone: Clone): boolean {
	if (clone.stripeCol === undefined) {
		return true; // no stripe limit to check
	}

	for (const plant of clone.plants) {
		const plantsThatCanBypassStripe = ["oPumpkinHead", "oFlowerPot", "oLilyPad", "oILilyPad"];
		if (plantsThatCanBypassStripe.includes(plant.plantName)) {
			continue; // these plants can be placed anywhere
		}
		// plantcol is 0-indexed, so add 1 for the actual column number
		if (plant.plantCol + 1 > clone.stripeCol) {
			return false;
		}
	}

	return true;
}

function noDuplicatePlantTypesInTile(clone: Clone): boolean {
	const plantTypesByTile: { [key: string]: Set<string> } = {};

	for (const plant of clone.plants) {
		const tileKey = `${plant.plantRow}-${plant.plantCol}`;

		if (!plantTypesByTile[tileKey]) {
			plantTypesByTile[tileKey] = new Set();
		}

		if (plantTypesByTile[tileKey].has(plant.plantName)) {
			return false;
		}

		plantTypesByTile[tileKey].add(plant.plantName);
	}

	return true;
}

function noDuplicateZombies(clone: Clone): boolean {
	if (!clone.selectedZombies) return true;

	const zombieSet = new Set<string>();

	for (const zombie of clone.selectedZombies) {
		if (zombieSet.has(zombie)) {
			return false;
		}
		zombieSet.add(zombie);
	}

	return true;
}

function noInvalidPlants(clone: Clone): boolean {
	const validPlants = [
		"oPeashooter",
		"oSunFlower",
		"oWallNut",
		"oPotatoMine",
		"oSnowPea",
		"oChomper",
		"oRepeater",
		"oPuffShroom",
		"oFumeShroom",
		"oHypnoShroom",
		"oScaredyShroom",
		"oLilyPad",
		"oILilyPad",
		"oSquash",
		"oThreepeater",
		"oTangleKlep",
		"oSpikeweed",
		"oTorchwood",
		"oTallNut",
		"oSeaShroom",
		"oCactus",
		"oSplitPea",
		"oStarfruit",
		"oPumpkinHead",
		"oFlowerPot",
		"oGarlic",
		"oGatlingPea",
		"oGloomShroom",
		"oSpikerock",
	];

	for (const plant of clone.plants) {
		if (!validPlants.includes(plant.plantName)) {
			console.log(plant.plantName, "is bad");
			return false;
		}
	}

	return true;
}

function noInvalidZombies(clone: Clone): boolean {
	if (!clone.selectedZombies) return true;

	const validZombies = new Set(iZombies);

	for (const zombie of clone.selectedZombies) {
		if (!validZombies.has(zombie)) {
			console.log(zombie, "is an invalid zombie type");
			return false;
		}
	}

	return true;
}

function cloneHasAllRequiredFields(clone: Clone): [boolean, string?] {
	const requiredFields = ["plants", "music", "sun", "name", "lfValue", "stripeCol"];

	for (const field of requiredFields) {
		if (!(field in clone)) {
			return [false, field];
		}
	}

	return [true];
}

function plantsHasAllRequiredFields(clone: Clone): boolean {
	const requiredFields = [
		"zIndex",
		"plantRow",
		"plantCol",
		"plantName",
		// "eleLeft",
		// "eleTop",
		// "eleWidth",
		// "eleHeight",
	];

	for (const plant of clone.plants) {
		for (const field of requiredFields) {
			if (!(field in plant)) {
				console.error(`Plant is missing required field: ${field}`, plant, clone);
				return false;
			}
		}
	}

	return true;
}

export function validateClone(clone: Clone): [boolean, string?] {
	const [doesCloneHaveAllRequiredFields, missingFields] = cloneHasAllRequiredFields(clone);
	if (!doesCloneHaveAllRequiredFields) {
		console.error("Clone is missing required fields:", missingFields);
		return [false, `Clone is missing required fields: ${missingFields}`];
	}

	if (!plantsHasAllRequiredFields(clone)) {
		console.error("Plants are missing required fields.");
		return [false, "Plants are missing required fields."];
	}

	if (!max3PlantsIn1Tile(clone)) {
		console.error("Too many plants in one tile.");
		return [false, "Too many plants in one tile."];
	}

	if (!maxLfLength7(clone)) {
		console.error("LF value length exceeds 7.");
		return [false, "LF value length exceeds 7."];
	}

	if (!maxSun9990(clone)) {
		console.error("Sun value exceeds 9990.");
		return [false, "Sun value exceeds 9990."];
	}

	if (!validMusic(clone)) {
		console.error("Invalid music track.");
		return [false, "Invalid music track."];
	}

	if (!validStripeCol(clone)) {
		console.error("Invalid stripe column.");
		return [false, "Invalid stripe column."];
	}

	if (!hasValidPlantCount(clone)) {
		console.error("Too many plants in the clone.");
		return [false, "Too many plants in the clone."];
	}

	if (!noPlantsAfterStripe(clone)) {
		console.error("Plants are placed after the stripe column.");
		return [false, "Plants are placed after the stripe column."];
	}

	if (!noDuplicatePlantTypesInTile(clone)) {
		console.error("Duplicate plant types in the same tile.");
		return [false, "Duplicate plant types in the same tile."];
	}

	if (!noDuplicateZombies(clone)) {
		console.error("Duplicate zombies in selected zombies.");
		return [false, "Duplicate zombies in selected zombies."];
	}

	if (!noInvalidPlants(clone)) {
		console.error("Clone contains invalid plants.");
		return [false, "Clone contains invalid plants."];
	}

	if (!noInvalidZombies(clone)) {
		console.error("Clone contains invalid zombies.");
		return [false, "Clone contains invalid zombies."];
	}

	if (!hasAllRequiredProperties(clone)) {
		console.error("Clone is missing some required properties.");
		return [false, "Clone is missing some required properties."];
	}

	return [true];
}
