"use server";

export async function submitForm(formData: FormData) {
  const name = formData.get("name");
  // Server action logic
  return { success: true, name };
}
