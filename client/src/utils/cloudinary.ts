const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL?.trim() || "http://localhost:5001";

type SignUploadResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  uploadPreset: string;
};

/**
 * Upload a file to Cloudinary using a server-generated signature (API secret
 * stays on the server). Requires a valid Supabase session access token.
 */
export async function uploadToCloudinary(
  file: File,
  accessToken: string
): Promise<string> {
  const token = accessToken.trim();
  if (!token) {
    throw new Error("Not signed in");
  }

  const signRes = await fetch(`${SERVER_URL}/cloudinary/sign-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!signRes.ok) {
    let message = `Could not get upload signature (${signRes.status})`;
    try {
      const err = (await signRes.json()) as { error?: string };
      if (err?.error) message = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const sign = (await signRes.json()) as SignUploadResponse;
  if (
    !sign.cloudName ||
    !sign.apiKey ||
    typeof sign.timestamp !== "number" ||
    !sign.signature ||
    !sign.uploadPreset
  ) {
    throw new Error("Invalid sign-upload response");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", sign.apiKey);
  formData.append("timestamp", String(sign.timestamp));
  formData.append("signature", sign.signature);
  formData.append("upload_preset", sign.uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`,
    { method: "POST", body: formData }
  );

  const payload = (await response.json()) as {
    secure_url?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    const msg =
      payload?.error?.message ?? `Cloudinary upload failed: ${response.status}`;
    throw new Error(msg);
  }
  if (!payload.secure_url) {
    throw new Error("Cloudinary response missing secure_url");
  }
  return payload.secure_url;
}
