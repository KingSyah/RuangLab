// Supabase secara otomatis mendeteksi token di URL (setelah tanda #)
// Anda hanya perlu menjalankan ini saat halaman dimuat
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    const newPassword = prompt("Masukkan password baru Anda:");
    if (newPassword) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) alert("Error: " + error.message);
      else alert("Password berhasil diperbarui!");
    }
  }
});