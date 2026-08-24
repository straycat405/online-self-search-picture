import { createSupabaseContext } from "npm:@supabase/server@^1";

type CleanupJob = {
  job_id: string;
  job_user_id: string;
  photo_path: string | null;
  delete_results: boolean;
};

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ message: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  const expectedSecret = Deno.env.get("CLEANUP_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-cleanup-secret");
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return Response.json({ message: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const { data: context, error: contextError } = await createSupabaseContext(request, {
    auth: "none",
  });
  if (contextError) {
    return Response.json(
      { message: "Admin context unavailable" },
      { status: 500, headers: jsonHeaders },
    );
  }

  const workerId = crypto.randomUUID();
  const { data, error: claimError } = await context.supabaseAdmin.rpc(
    "claim_expired_search_cleanup",
    { requested_limit: 50, worker_id: workerId },
  );
  if (claimError) {
    console.error("cleanup claim failed", claimError.code);
    return Response.json({ message: "Cleanup claim failed" }, { status: 500, headers: jsonHeaders });
  }

  const jobs = (data ?? []) as CleanupJob[];
  const summary = {
    claimed: jobs.length,
    photosDeleted: 0,
    jobsDeleted: 0,
    orphansDeleted: 0,
    retries: 0,
  };

  for (const job of jobs) {
    let photoRemoved = job.photo_path === null;
    let cleanupFailure: string | null = null;

    if (job.photo_path) {
      const allowedPaths = new Set([
        `${job.job_user_id}/${job.job_id}/query.jpg`,
        `${job.job_user_id}/${job.job_id}/query.png`,
        `${job.job_user_id}/${job.job_id}/query.webp`,
      ]);
      const validPath = allowedPaths.has(job.photo_path);

      if (!validPath) {
        cleanupFailure = "invalid_photo_path";
      } else {
        const { error: removeError } = await context.supabaseAdmin.storage
          .from("search-photos")
          .remove([job.photo_path]);
        photoRemoved = !removeError;
        cleanupFailure = removeError ? "storage_remove_failed" : null;
      }
    }

    const { data: outcome, error: finishError } = await context.supabaseAdmin.rpc(
      "finish_expired_search_cleanup",
      {
        requested_job_id: job.job_id,
        worker_id: workerId,
        photo_removed: photoRemoved,
        cleanup_failure: cleanupFailure,
      },
    );

    if (finishError) {
      console.error("cleanup finish failed", job.job_id, finishError.code);
      summary.retries += 1;
    } else if (outcome === "job_deleted") {
      summary.photosDeleted += job.photo_path ? 1 : 0;
      summary.jobsDeleted += 1;
    } else if (outcome === "photo_deleted") {
      summary.photosDeleted += job.photo_path ? 1 : 0;
    } else {
      summary.retries += 1;
    }
  }

  const { data: orphanRows, error: orphanListError } = await context.supabaseAdmin.rpc(
    "list_orphan_search_photos",
    { requested_limit: 50 },
  );
  if (orphanListError) {
    console.error("orphan list failed", orphanListError.code);
    summary.retries += 1;
  } else {
    const orphanPaths = ((orphanRows ?? []) as Array<{ photo_path: string }>)
      .map((row) => row.photo_path)
      .filter((path) =>
        /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/query\.(?:jpg|png|webp)$/.test(path),
      );
    if (orphanPaths.length) {
      const { error: orphanRemoveError } = await context.supabaseAdmin.storage
        .from("search-photos")
        .remove(orphanPaths);
      if (orphanRemoveError) {
        console.error("orphan cleanup failed", orphanRemoveError.name);
        summary.retries += 1;
      } else {
        summary.orphansDeleted = orphanPaths.length;
      }
    }
  }

  return Response.json(summary, { headers: jsonHeaders });
});
