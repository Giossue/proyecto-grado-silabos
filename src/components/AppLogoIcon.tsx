import Image from "next/image"

export function AppLogoIcon({ className }: { className?: string }) {
  return <Image src="/logo-128.png" alt="Sílabos UEB" width={128} height={128} unoptimized className={className} />
}
