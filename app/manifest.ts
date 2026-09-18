import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "K-MKT Workspace",
    short_name: "K-MKT",
    description: "Quản lý công việc Marketing",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8fc",
    theme_color: "#d62828",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }]
  };
}
