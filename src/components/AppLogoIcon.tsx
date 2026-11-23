import Image from "next/image"

export function AppLogoIcon({ className }: { className?: string }) {
  return <Image src="/logo.png" alt="Sílabos UEB" width={512} height={512} unoptimized className={className} />
}
