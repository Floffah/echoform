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
            { text: "Game", link: "/game" },
            { text: "Backend Reference", link: "/backend-reference" },
        ],

        sidebar: {
            "/backend-reference": [
                {
                    text: "Flows",
                    link: "/backend-reference/flows",
                    items: [
                        {
                            text: "Authentication",
                            link: "/backend-reference/flows/authentication",
                        },
                    ],
                },
            ],
            "/game": [
                {
                    text: "Game",
                    link: "/game",
                    items: [
                        {
                            text: "Story",
                            link: "/game/story",
                        },
                        {
                            text: "Music",
                            link: "/game/music",
                        },
                    ],
                }
            ],
        },

        socialLinks: [
            { icon: "github", link: "https://github.com/floffah/echoform" },
        ],

        editLink: {
            pattern: 'https://github.com/floffah/echoform/edit/main/docs/:path'
        },
    } as DefaultTheme.Config,
});
