import type { SiteType } from './version.js';

export type { SiteType } from './version.js';

export interface StoreData {
	version: number;
	pubkey: string;
	name: string;
	description?: string;
	image?: string;
	tags: Tag[];
	items: Item[];
}

export interface Item {
	name: string;
	price: number;
	description?: string;
	image?: string;
	tags: Tag[];
}

export type Tag = { key: string; value?: string };

export interface EventData {
	version: number;
	siteType: 'event';
	pubkey?: string;
	name: string;
	description?: string;
	image?: string;
	tags: Tag[];
}

export interface MessageData {
	version: number;
	siteType: 'message';
	pubkey?: string;
	name: string;
	description?: string;
	image?: string;
	tags: Tag[];
}

export interface FundraiserData {
	version: number;
	siteType: 'fundraiser';
	pubkey?: string;
	name: string;
	description?: string;
	image?: string;
	tags: Tag[];
}

export interface PetitionData {
	version: number;
	siteType: 'petition';
	pubkey: string;
	name: string;
	description?: string;
	image?: string;
	tags: Tag[];
}

export interface ForumData {
	version: number;
	siteType: 'discussion';
	pubkey: string;
	name: string;
	description?: string;
	image?: string;
	tags: Tag[];
}

export interface DropData {
	version: number;
	siteType: 'drop';
	pubkey?: string;
	name: string;
	description?: string;
	tags: Tag[];
}

export interface ArtData {
	version: number;
	siteType: 'art';
	pubkey?: string;
	name: string;
	svg?: string;
	tags: Tag[];
}

export type SiteData =
	| ({ siteType: 'store' } & StoreData)
	| EventData
	| MessageData
	| FundraiserData
	| PetitionData
	| ForumData
	| DropData
	| ArtData;
