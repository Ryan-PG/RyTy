import { describe, it, expect } from "vitest";
import { formatAmountInput, parseAmountToMinor } from "./format";

describe("formatAmountInput", () => {
  it("groups the integer part in thousands", () => {
    expect(formatAmountInput("0")).toBe("0");
    expect(formatAmountInput("12")).toBe("12");
    expect(formatAmountInput("999")).toBe("999");
    expect(formatAmountInput("1000")).toBe("1,000");
    expect(formatAmountInput("1234567")).toBe("1,234,567");
  });

  it("keeps the decimal part as typed", () => {
    expect(formatAmountInput("1234.5")).toBe("1,234.5");
    expect(formatAmountInput("1234.56")).toBe("1,234.56");
    expect(formatAmountInput("0.00")).toBe("0.00");
  });

  it("keeps a trailing dot while typing", () => {
    expect(formatAmountInput("12.")).toBe("12.");
    expect(formatAmountInput(".")).toBe(".");
  });

  it("strips separators and stray characters, then regroups", () => {
    expect(formatAmountInput("1,234567")).toBe("1,234,567");
    expect(formatAmountInput("1,234,567")).toBe("1,234,567");
    expect(formatAmountInput(" 1a2b3 ")).toBe("123");
    expect(formatAmountInput("1.2.3")).toBe("1.23");
  });

  it("stays compatible with parseAmountToMinor", () => {
    const grouped = formatAmountInput("1234567");
    expect(parseAmountToMinor(grouped)).toBe(123456700);
    expect(parseAmountToMinor(formatAmountInput("1234.56"))).toBe(123456);
    expect(parseAmountToMinor(grouped)).not.toBeNull();
  });
});
