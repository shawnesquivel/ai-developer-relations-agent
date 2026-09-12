import {
  Card,
  CardBody,
  CardHeader,
  Divider,
  H1,
  Pill,
  Row,
  Stack,
  Text,
  useCanvasState,
} from "cursor/canvas";

type Slide = {
  n: string;
  title: string;
  line: string;
  visual: string;
  speaker: string;
  flow?: boolean;
};

const SLIDES: Slide[] = [
  {
    n: "01",
    title: "The next user is an agent",
    line: "They decide what to run.",
    visual:
      "Empty page. Chapter title only. One period. No product name, no logos, no market slide.",
    speaker:
      "We are building something agents want — not another site for humans to skim. The next trillion users will be agents as decision makers. They will choose which SDK to trust and which lesson to ingest. Agents and humans both need cookbooks they can run and test before generative engines pick the code up. If the lesson is wrong, the agent ships the lie at scale.",
  },
  {
    n: "02",
    title: "Docs lie",
    line: "Claude writes slop.",
    visual:
      "A single TypeScript fence, struck through. White space around it. No competitor grid. No logos.",
    speaker:
      "You can already ask Claude to write a cookbook. It writes slop. Dependencies break all the time; last month’s snippet is this month’s 404. So DevRel has to build and maintain every example — and we do not want to bog down engineers with that. The competitor is the default: generate, paste, pray.",
  },
  {
    n: "03",
    title: "Cookbooks that test themselves",
    line: "A lesson ships only after it runs.",
    visual:
      "Title page. One sentence, centered. Nothing else. This is the whole product.",
    speaker:
      "Neo4j plans the missing SDK lesson. GPT-5.6 writes a strict TypeScript cookbook. Every code block must pass in a fresh Daytona sandbox. We are not generating blog posts. We are generating lessons that refuse to publish until they run. When a sponsor is missing, the mock stays labeled. We never pretend a live lock we do not have.",
  },
  {
    n: "04",
    title: "How the four lock",
    line: "Graph. Write. Sandbox. Proof.",
    visual:
      "One horizontal line of four names, hairline connectors, no boxes, no icons. Caption under the last: GitHub who-am-I.",
    speaker:
      "Neo4j does not take a free-form prompt. It picks the most useful missing concept from the Composio core-concept graph. OpenAI GPT-5.6 writes the cookbook — Nosana later; we do not headline a dead Jupyter job. Daytona runs untrusted generated code in a fresh sandbox, then deletes it. Composio is the first subject: tools.get, PAT connectedAccounts, tools.execute. GitHub who-am-I. Not Slack OAuth.",
    flow: true,
  },
  {
    n: "05",
    title: "Plan. Write. Verify.",
    line: "Daytona HackSprint Tokyo.",
    visual:
      "Three words in a row, then silence. Small close: GitHub who-am-I. No QR. No thank-you energy.",
    speaker:
      "The live proof is the lock, in order. Neo4j chooses the gap. GPT-5.6 writes TypeScript. Daytona must pass every block. First real proof: Composio GitHub PAT who-am-I. If a sponsor is missing, we label the mock. We are at Daytona HackSprint Tokyo. The ask is the lock — graph, model, sandbox, SDK — and the next missing lesson.",
  },
];

const FLOW = [
  { name: "Neo4j", role: "plan" },
  { name: "OpenAI", role: "write" },
  { name: "Daytona", role: "sandbox" },
  { name: "Composio", role: "who-am-I" },
] as const;

function SponsorFlow() {
  return (
    <Row gap={12} align="end" wrap>
      {FLOW.map((node, i) => (
        <Row key={node.name} gap={12} align="end">
          {i > 0 ? (
            <Text tone="quaternary" as="span">
              —
            </Text>
          ) : null}
          <Stack gap={4}>
            <Text weight="semibold">{node.name}</Text>
            <Text tone="tertiary" size="small">
              {node.role}
            </Text>
          </Stack>
        </Row>
      ))}
    </Row>
  );
}

function OnSlide({ slide }: { slide: Slide }) {
  return (
    <Stack gap={24} style={{ maxWidth: 520, paddingTop: 32, paddingBottom: 16 }}>
      <Text tone="tertiary" size="small">
        {slide.n}
      </Text>
      <H1>{slide.title}</H1>
      <Text italic>{slide.line}</Text>
      <Divider />
      <Stack gap={8}>
        <Text tone="tertiary" size="small">
          On slide
        </Text>
        <Text tone="secondary">{slide.visual}</Text>
      </Stack>
      {slide.flow ? <SponsorFlow /> : null}
    </Stack>
  );
}

export default function HackathonDeck() {
  const [index, setIndex] = useCanvasState("slide", 0);
  const slide = SLIDES[Math.min(index, SLIDES.length - 1)];

  return (
    <Stack gap={20} style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <Stack gap={6}>
        <Text tone="tertiary" size="small">
          Outline · five pages · not a deck
        </Text>
        <Text weight="semibold">Docs that Test Themselves</Text>
      </Stack>

      <Row gap={6} wrap>
        {SLIDES.map((s, i) => (
          <Pill key={s.n} active={i === index} onClick={() => setIndex(i)}>
            {s.n}
          </Pill>
        ))}
      </Row>

      <OnSlide slide={slide} />

      <Card>
        <CardHeader>Speaker</CardHeader>
        <CardBody>
          <Text tone="secondary">{slide.speaker}</Text>
        </CardBody>
      </Card>
    </Stack>
  );
}
