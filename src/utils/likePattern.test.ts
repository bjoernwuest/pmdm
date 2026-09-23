import { describe, expect, test } from "bun:test";
import { wildcardToLikePattern } from "@/utils/likePattern.ts";

describe("wildcardToLikePattern", () => {
    test("returns empty string for empty or whitespace-only input", () => {
        expect(wildcardToLikePattern("")).toBe("");
        expect(wildcardToLikePattern("   ")).toBe("");
        expect(wildcardToLikePattern("\t\n")).toBe("");
    });

    test("wraps plain text as an implicit contains match and trims surrounding whitespace", () => {
        expect(wildcardToLikePattern("john")).toBe("%john%");
        expect(wildcardToLikePattern("  john  ")).toBe("%john%");
    });

    test("translates '*' to '%' and '?' to '_'", () => {
        expect(wildcardToLikePattern("jo*n")).toBe("%jo%n%");
        expect(wildcardToLikePattern("j?ne")).toBe("%j_ne%");
        expect(wildcardToLikePattern("*")).toBe("%%%");
    });

    test("escapes literal LIKE metacharacters", () => {
        expect(wildcardToLikePattern("50%")).toBe("%50\\%%");
        expect(wildcardToLikePattern("a_b")).toBe("%a\\_b%");
        expect(wildcardToLikePattern("a\\b")).toBe("%a\\\\b%");
    });

    test("combines wildcards and literal text", () => {
        expect(wildcardToLikePattern("a*b?c")).toBe("%a%b_c%");
    });
});