# Diagram Patterns for Quranic Connection Maps

This file gives Mermaid templates for the most common structural patterns. Choose the pattern based on the relationship between the anchor and its connections — not all maps should be hub-and-spoke.

## Pattern 1: Hub-and-spoke (default)

Use when the anchor is a single verse and multiple verses act upon it independently. This is the default — start here unless the structure suggests otherwise.

```
flowchart TB
    A["📖 ANCHOR<br/>Sūrah 1:7<br/>«ġayri-l-maġḍūbi ʿalayhim»"]:::anchor

    subgraph TEFSIR["Tefsir / تفسير"]
        B1["4:69<br/>peygamberler, sıddîklar,<br/>şehidler, sâlihler"]
        B2["5:60<br/>gazaba uğrayanların tarifi"]
        B3["2:108<br/>hidayet sonrası sapma"]
    end

    B1 -->|"açıklar"| A
    B2 -->|"açıklar"| A
    B3 -->|"açıklar"| A

    classDef anchor fill:#1a4d7a,stroke:#0d2c4a,color:#fff,stroke-width:3px
```

## Pattern 2: Grouped by relationship type

Use when the anchor has connections of multiple types. Group them into subgraphs by relationship category for readability.

```
flowchart TB
    A["📖 ANCHOR<br/>Sūrah 2:275<br/>«ahalla-llāhu-l-bayʿ»"]:::anchor

    subgraph TAHSIS["Tahsis / تخصيص"]
        T1["2:278-279<br/>ribâ yasağı"]
        T2["5:90<br/>hamr alım-satımı"]
    end

    subgraph BEYAN["Beyan / بيان"]
        B1["2:282<br/>borç akdi şartları"]
        B2["4:29<br/>karşılıklı rıza şartı"]
    end

    T1 -->|"sınırlar"| A
    T2 -->|"sınırlar"| A
    B1 -->|"tafsil eder"| A
    B2 -->|"tafsil eder"| A

    classDef anchor fill:#1a4d7a,stroke:#0d2c4a,color:#fff,stroke-width:3px
```

## Pattern 3: Chain / cascading clarification

Use when verse B clarifies the anchor, and verse C in turn clarifies verse B. Common in legal verses where conditions stack.

```
flowchart LR
    A["📖 ANCHOR<br/>4:92<br/>«fa-taḥrīru raqaba»"]:::anchor
    B["4:92 devamı<br/>«muʾmina»"]:::mid
    C["49:14-15<br/>iman tanımı"]:::leaf

    C -->|"tanımlar"| B
    B -->|"kayıtlar"| A

    classDef anchor fill:#1a4d7a,stroke:#0d2c4a,color:#fff,stroke-width:3px
    classDef mid fill:#3a6ea5,stroke:#1a4d7a,color:#fff
    classDef leaf fill:#6c9bd1,stroke:#3a6ea5,color:#fff
```

## Pattern 4: Ring composition (chiasmus)

Use when the anchor sits at the center of a structurally symmetric passage — common in surahs with concentric architecture (e.g., Yūsuf, al-Baqarah opening).

```
flowchart TB
    O1["A<br/>başlangıç"]:::ring
    O2["B<br/>ikinci halka"]:::ring
    CENTER["📖 MERKEZ<br/>Sūrah X:Y"]:::anchor
    O2p["B'<br/>ikinci halka yankı"]:::ring
    O1p["A'<br/>başlangıç yankı"]:::ring

    O1 --> O2 --> CENTER --> O2p --> O1p

    classDef anchor fill:#1a4d7a,stroke:#0d2c4a,color:#fff,stroke-width:3px
    classDef ring fill:#c9d6e8,stroke:#3a6ea5,color:#000
```

## Pattern 5: Dialectical pair

Use when the anchor and one other verse stand in productive tension — neither modifies the other directly, but together they form a balanced theological statement.

```
flowchart LR
    A["📖 ANCHOR<br/>39:53<br/>«lā taqnaṭū min raḥmati-llāh»"]:::anchor
    B["📖 EŞ AYET<br/>7:99<br/>«lā yaʾmanu makra-llāh»"]:::anchor

    A <-->|"dengeler<br/>(havf ↔ recâ)"| B

    classDef anchor fill:#1a4d7a,stroke:#0d2c4a,color:#fff,stroke-width:3px
```

## Pattern 6: Concept trace (word concordance)

Use when the user wants to follow a single Arabic root or word across the Quran rather than explain one verse. The anchor is the *concept*, not a single verse.

```
flowchart TB
    CORE["🔤 KÖK<br/>ت ق و ى<br/>(taqwā)"]:::concept

    V1["2:2<br/>«hudan li-l-muttaqīn»"]
    V2["49:13<br/>«inna akramakum ʿinda-llāhi atqākum»"]
    V3["3:102<br/>«ittaqu-llāha ḥaqqa tuqātih»"]
    V4["65:2-3<br/>«wa-man yattaqi-llāha…»"]

    CORE --- V1
    CORE --- V2
    CORE --- V3
    CORE --- V4

    classDef concept fill:#7a4d1a,stroke:#4a2c0d,color:#fff,stroke-width:3px
```

## Choosing the pattern

Quick decision guide:

- One anchor, multiple independent clarifying verses → **Pattern 1**.
- One anchor, clarifications of different types → **Pattern 2**.
- Conditions stacking on each other → **Pattern 3**.
- Anchor sits at the center of a symmetric passage → **Pattern 4**.
- Anchor and one counterweight verse forming a balanced pair → **Pattern 5**.
- Tracing a word or concept rather than explaining one verse → **Pattern 6**.

When in doubt, default to Pattern 2 (grouped by relationship type). It scales gracefully from 3 to 8 connections.

## Mermaid technical notes

- Always quote node labels containing punctuation, Arabic, or colons: `A["..."]`.
- Use `<br/>` for line breaks inside labels.
- Edge labels go in pipes: `A -->|"label"| B`.
- For Arabic-heavy diagrams, consider SVG via `Goodnotes:draw_svg_image` instead — Mermaid Arabic rendering is inconsistent. Transliterate when staying in Mermaid.
- Stick to `flowchart TB` (top-bottom) or `flowchart LR` (left-right). Avoid `graph` (older, less reliable).
- Keep edges to 3–8 in a single diagram. If more, split into multiple diagrams by theme or use subgraphs aggressively.
