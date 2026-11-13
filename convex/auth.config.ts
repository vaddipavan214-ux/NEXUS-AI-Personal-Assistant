export default {
  providers: [
    {
      domain:
        process.env.CONVEX_SITE_URL ||
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
        "https://clear-roadrunner-606.convex.site",
      applicationID: "convex",
    },
  ],
};
