"use client";

import { useParams } from "next/navigation";
import { WelcomeCardStudio } from "@/components/features/server/studio/WelcomeCardStudio";

export default function WelcomeCardStudioPage() {
  const params = useParams<{ guildId: string }>();
  return <WelcomeCardStudio guildId={params.guildId} />;
}
