import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SpotifyConnect } from "@/components/spotify-connect";
import { isSpotifyConfigured } from "@/lib/auth";

export function SignInPrompt({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="mx-auto max-w-md space-y-4 py-10 text-center">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      <div className="flex justify-center pt-2">
        <SpotifyConnect spotifyConfigured={isSpotifyConfigured} />
      </div>
    </Card>
  );
}
