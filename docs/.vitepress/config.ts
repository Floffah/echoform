import { type DefaultTheme, defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

// https://vitepress.dev/reference/site-config
export default withMermaid({
    title: "Echoform Authoritative Docs",
    description:
        "Technical documentation for the Echoform game authoritative server",
    appearance: true,
    lastUpdated: true,
    base: "/echoform/",

    themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        nav: [
            { text: "Technical Reference", link: "/tech-refs" },
            { text: "Universe & Lore", link: "https://echoform.vvd.world" },
        ],

        sidebar: {
            "/tech-refs": [
                {
                    text: "Flows",
                    link: "/tech-refs/flows",
                    items: [
                        {
                            text: "Authentication",
                            link: "/tech-refs/flows/authentication",
                        },
                    ],
                },
            ]
        },

        socialLinks: [
            { icon: "github", link: "https://github.com/floffah/echoform" },
        ],

        editLink: {
            pattern: 'https://github.com/floffah/echoform/edit/main/docs/:path'
        },
    } as DefaultTheme.Config,
});
