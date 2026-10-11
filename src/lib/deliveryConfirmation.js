export function functionBody(response) {
  let body = response;
  for (let depth = 0; depth < 2 && body?.data && body.success === undefined; depth++) {
    body = body.data;
  }
  return body;
}

// Read back this exact course after a lost response; never retry the financial
// mutation automatically.
export async function confirmDelivery(api, courseId) {
  let result;
  let failure;
  try {
    result = functionBody(await api.functions.invoke("finaliserLivraisonLivreur", {
      course_id: courseId,
    }));
    if (result?.success === true) return result;
  } catch (error) {
    failure = error;
  }
  const saved = await api.entities.CourseExterne.get(courseId).catch(() => null);
  if (saved?.id === courseId && saved.statut === "livree") {
    return { success: true, confirmedByRead: true };
  }
  throw new Error(result?.error || failure?.response?.data?.error || failure?.message || "Livraison non confirmée. Réessayez.");
}
