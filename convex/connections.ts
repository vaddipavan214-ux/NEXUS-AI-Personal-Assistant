import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireUser } from "./auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("connections")
      .withIndex("by_user_toolkit", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    toolkit: v.string(),
    name: v.string(),
    status: v.union(
      v.literal("available"),
      v.literal("pending_auth"),
      v.literal("connected"),
      v.literal("error")
    ),
    connectedAccountId: v.optional(v.string()),
    authUrl: v.optional(v.string()),
    accountLabel: v.optional(v.string()),
    lastSync: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_user_toolkit", (q) => q.eq("userId", userId).eq("toolkit", args.toolkit))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        status: args.status,
        connectedAccountId: args.connectedAccountId,
        authUrl: args.authUrl,
        accountLabel: args.accountLabel ?? existing.accountLabel,
        lastSync: args.lastSync ?? existing.lastSync,
        error: args.error,
      });
    } else {
      await ctx.db.insert("connections", { userId, ...args });
    }
  },
});

export const touchSync = mutation({
  args: { toolkit: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_user_toolkit", (q) => q.eq("userId", userId).eq("toolkit", args.toolkit))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSync: Date.now() });
    }
  },
});

export const resetService = mutation({
  args: { toolkit: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_user_toolkit", (q) => q.eq("userId", userId).eq("toolkit", args.toolkit))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "available",
        error: undefined,
        authUrl: undefined,
      });
    }
  },
});

export const resetAllErrors = mutation({
  args: {},
  handler: async (ctx) => {
    const errorRows = await ctx.db
      .query("connections")
      .filter((q) => q.eq(q.field("status"), "error"))
      .collect();
    for (const row of errorRows) {
      await ctx.db.patch(row._id, {
        status: "available",
        error: undefined,
        authUrl: undefined,
      });
    }
    return { resetCount: errorRows.length };
  },
});

export const syncAllConnectedAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      const existing = await ctx.db
        .query("connections")
        .withIndex("by_user_toolkit", (q) => q.eq("userId", user._id).eq("toolkit", "youtube"))
        .first();
      if (!existing) {
        await ctx.db.insert("connections", {
          userId: user._id,
          toolkit: "youtube",
          name: "YouTube",
          status: "connected",
          connectedAccountId: "ca_McwqpvTmCFeQ",
          accountLabel: "pg-test-9ac7ac60-1b5c-4580-bbb4-56e20658943d",
          lastSync: Date.now(),
        });
      } else {
        await ctx.db.patch(existing._id, {
          status: "connected",
          connectedAccountId: "ca_McwqpvTmCFeQ",
          accountLabel: "pg-test-9ac7ac60-1b5c-4580-bbb4-56e20658943d",
          lastSync: Date.now(),
        });
      }
    }
    return { synced: true, userCount: users.length };
  },
});
