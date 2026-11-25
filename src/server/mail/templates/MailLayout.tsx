import type { CSSProperties, ReactNode } from "react"
import { Body, Button, Container, Head, Heading, Html, Link, Section, Text } from "@react-email/components"

export type MailApp = { name: string; frontendUrl: string; locale: string }

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'"
const PRIMARY = "#122c41"

const body: CSSProperties = { backgroundColor: "#eef2f7", color: "#121c28", fontFamily: FONT, margin: 0, padding: 0, width: "100%" }
const header: CSSProperties = { padding: "25px 0", textAlign: "center" }
const headerLink: CSSProperties = { color: PRIMARY, fontSize: "19px", fontWeight: "bold", textDecoration: "none" }
const card: CSSProperties = { backgroundColor: "#ffffff", border: "1px solid #dbe3ec", borderRadius: "2px", margin: "0 auto 32px", maxWidth: "570px", padding: "32px" }
const paragraph: CSSProperties = { fontSize: "16px", lineHeight: "1.5em", margin: "0 0 16px", textAlign: "left" }
const heading: CSSProperties = { color: PRIMARY, fontSize: "18px", fontWeight: "bold", margin: "0 0 16px", textAlign: "left" }
const action: CSSProperties = { margin: "30px auto", textAlign: "center" }
const button: CSSProperties = { backgroundColor: PRIMARY, borderRadius: "4px", color: "#ffffff", display: "inline-block", padding: "8px 18px", textDecoration: "none" }
const subcopy: CSSProperties = { borderTop: "1px solid #dbe3ec", marginTop: "25px", paddingTop: "25px" }
const subcopyText: CSSProperties = { fontSize: "14px", lineHeight: "1.5em", margin: 0, textAlign: "left" }
const breakAll: CSSProperties = { color: PRIMARY, wordBreak: "break-all" }

export function MailLayout({ app, children, subcopyUrl }: { app: MailApp; children: ReactNode; subcopyUrl?: string }) {
  return (
    <Html lang={app.locale.replace(/_/g, "-")}>
      <Head>
        <title>{app.name}</title>
      </Head>
      <Body style={body}>
        <Section style={header}>
          <Link href={app.frontendUrl} style={headerLink}>
            {app.name}
          </Link>
        </Section>
        <Container style={card}>
          {children}
          {subcopyUrl === undefined ? null : (
            <Section style={subcopy}>
              <Text style={subcopyText}>
                {"Si el botón no funciona, copie este enlace en su navegador: "}
                <Link href={subcopyUrl} style={breakAll}>
                  {subcopyUrl}
                </Link>
              </Text>
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  )
}

export function MailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={heading}>
      {children}
    </Heading>
  )
}

export function MailText({ children }: { children: ReactNode }) {
  return <Text style={paragraph}>{children}</Text>
}

export function MailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={action}>
      <Button href={href} style={button}>
        {children}
      </Button>
    </Section>
  )
}

export function MailList({ items }: { items: string[] }) {
  return (
    <ul style={{ ...paragraph, paddingLeft: "20px" }}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}
