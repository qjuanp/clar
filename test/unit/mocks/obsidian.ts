/**
 * Minimal runtime stand-in for the `obsidian` package, which ships type
 * declarations only (no real JS - the real classes are injected by the
 * Obsidian app at plugin-load time). vitest aliases the `obsidian` import to
 * this module (see vitest.config.ts) so that `update-column.ts`'s `instanceof
 * ListValue`/`NullValue`/`NumberValue`/`BooleanValue` checks have a real class to check
 * against, and so tests can construct matching instances.
 */

export abstract class Value {
	abstract toString(): string;
	abstract isTruthy(): boolean;
}

export abstract class NotNullValue extends Value {}

export abstract class PrimitiveValue<T> extends NotNullValue {
	constructor(protected readonly value: T) {
		super();
	}

	toString(): string {
		return String(this.value);
	}

	isTruthy(): boolean {
		return Boolean(this.value);
	}
}

export class StringValue extends PrimitiveValue<string> {}

export class NumberValue extends PrimitiveValue<number> {}

export class BooleanValue extends PrimitiveValue<boolean> {}

export class NullValue extends Value {
	toString(): string {
		return '';
	}

	isTruthy(): boolean {
		return false;
	}

	static value = new NullValue();
}

export class ListValue extends NotNullValue {
	constructor(private readonly items: unknown[]) {
		super();
	}

	toString(): string {
		return this.items.map((item) => String(item)).join(', ');
	}

	isTruthy(): boolean {
		return this.items.length > 0;
	}

	length(): number {
		return this.items.length;
	}

	get(index: number): Value {
		const item = this.items[index];
		if (item === undefined) {
			return NullValue.value;
		}
		return item instanceof Value ? item : new StringValue(String(item));
	}
}
