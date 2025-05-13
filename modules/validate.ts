interface Plant {
	zIndex: number;
	plantRow: number;
	plantCol: number;
	plantName: string;
	eleLeft: number;
	eleTop: number;
}

interface Clone {
	plants: Plant[];
	music: string;
	sun: number;
	name: string;
	lfValue: number[];
	stripeCol: number;
	screenshot?: string;
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
	return (
		clone.stripeCol >= MIN_STRIPE_COL && clone.stripeCol <= MAX_STRIPE_COL
	);
}

function hasValidPlantCount(clone: Clone): boolean {
	const MAX_PLANTS = 126; // TODO: CALCULATE THIS PROPERLY LATER
	return clone.plants.length <= MAX_PLANTS;
}

function noPlantsAfterStripe(clone: Clone): boolean {
	for (const plant of clone.plants) {
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

function cloneHasAllRequiredFields(clone: Clone): boolean {
	const requiredFields = [
		"plants",
		"music",
		"sun",
		"name",
		"lfValue",
		"stripeCol",
	];

	for (const field of requiredFields) {
		if (!(field in clone)) {
			return false;
		}
	}

	return true;
}

function plantsHasAllRequiredFields(clone: Clone): boolean {
	const requiredFields = [
		"zIndex",
		"plantRow",
		"plantCol",
		"plantName",
		// "eleLeft",
		// "eleTop",
	];

	for (const plant of clone.plants) {
		for (const field of requiredFields) {
			if (!(field in plant)) {
				console.error(
					`Plant is missing required field: ${field}`,
					plant,
					clone,
				);
				return false;
			}
		}
	}

	return true;
}

export function validateClone(clone: Clone): boolean {
	if (!cloneHasAllRequiredFields(clone)) {
		console.error("Clone is missing required fields.");
		return false;
	}

	if (!plantsHasAllRequiredFields(clone)) {
		console.error("Plants are missing required fields.");
		return false;
	}

	if (!max3PlantsIn1Tile(clone)) {
		console.error("Too many plants in one tile.");
		return false;
	}

	if (!maxLfLength7(clone)) {
		console.error("LF value length exceeds 7.");
		return false;
	}

	if (!maxSun9990(clone)) {
		console.error("Sun value exceeds 9990.");
		return false;
	}

	if (!validMusic(clone)) {
		console.error("Invalid music track.");
		return false;
	}

	if (!validStripeCol(clone)) {
		console.error("Invalid stripe column.");
		return false;
	}

	if (!hasValidPlantCount(clone)) {
		console.error("Too many plants in the clone.");
		return false;
	}

	if (!noPlantsAfterStripe(clone)) {
		console.error("Plants are placed after the stripe column.");
		return false;
	}

	if (!noDuplicatePlantTypesInTile(clone)) {
		console.error("Duplicate plant types in the same tile.");
		return false;
	}

	if (!noInvalidPlants(clone)) {
		console.error("Clone contains invalid plants.");
		return false;
	}

	return true;
}
