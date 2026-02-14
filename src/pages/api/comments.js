import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Rate limit simple en memoria (funciona en serverless mientras la instancia viva)
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const lastRequest = rateLimitMap.get(ip);

  if (lastRequest && now - lastRequest < 30000) {
    return true; // 30 segundos
  }

  rateLimitMap.set(ip, now);
  return false;
}

export async function GET({ url }) {
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
    });
  }

  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_slug", slug)
    .order("created_at", { ascending: false }); // 🔥 más recientes primero

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST({ request }) {
  const body = await request.json();

  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Try again later." }),
      { status: 429 }
    );
  }

  const { post_slug, content, author, website } = body;

  // Honeypot anti-spam
  if (website) {
    return new Response(JSON.stringify({ error: "Spam detected" }), {
      status: 400,
    });
  }

  if (!post_slug || !content) {
    return new Response(JSON.stringify({ error: "Missing fields" }), {
      status: 400,
    });
  }

  // Sanitización mínima
  const cleanContent = content.trim().slice(0, 500);
  const cleanAuthor = author?.trim().slice(0, 50) || "Anónimo";

  const { data, error } = await supabase
    .from("comments")
    .insert([
      {
        post_slug,
        content: cleanContent,
        author: cleanAuthor,
      },
    ])
    .select();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE({ request }) {
  const { id } = await request.json();

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400,
    });
  }

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
