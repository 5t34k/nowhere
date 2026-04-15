export class DecodeError extends Error {
	code: string;
	constructor(message: string, code: string = 'DECODE_ERROR') {
		super(message);
		this.name = 'DecodeError';
		this.code = code;
	}
}

export class SchemaError extends Error {
	code: string;
	constructor(message: string, code: string = 'SCHEMA_ERROR') {
		super(message);
		this.name = 'SchemaError';
		this.code = code;
	}
}

export class ValidationError extends Error {
	code: string;
	constructor(message: string, code: string = 'VALIDATION_ERROR') {
		super(message);
		this.name = 'ValidationError';
		this.code = code;
	}
}
