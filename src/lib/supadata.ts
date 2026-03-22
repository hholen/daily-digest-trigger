const SUPADATA_API_URL = "https://api.supadata.ai/v1/youtube/transcript";

interface TranscriptResponse {
  content: string | null;
}

interface AsyncResponse {
  jobId: string;
}

interface JobStatusResponse {
  status: "pending" | "processing" | "completed" | "failed";
  data?: { content: string | null };
}

async function pollForTranscript(
  jobId: string,
  apiKey: string,
  maxAttempts = 10
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript/job/${jobId}`,
      { headers: { "x-api-key": apiKey } }
    );

    if (!res.ok) continue;

    const data = (await res.json()) as JobStatusResponse;

    if (data.status === "completed") {
      return data.data?.content || null;
    }
    if (data.status === "failed") {
      return null;
    }
  }
  return null;
}

export async function fetchTranscriptText(
  videoId: string
): Promise<string | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) throw new Error("SUPADATA_API_KEY is not set");

  const url = `${SUPADATA_API_URL}?url=https://www.youtube.com/watch?v=${videoId}&lang=en&text=true`;

  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
  });

  if (res.status === 200) {
    const data = (await res.json()) as TranscriptResponse;
    return data.content || null;
  }

  if (res.status === 202) {
    const { jobId } = (await res.json()) as AsyncResponse;
    return pollForTranscript(jobId, apiKey);
  }

  if (res.status === 404) return null;

  const body = await res.text().catch(() => "");
  throw new Error(`Supadata API error ${res.status}: ${body}`);
}
