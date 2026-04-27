// Konfigurasi Supabase
const SUPABASE_URL = 'https://qfbqoyyatqjgraybkhcr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gpKMwLHoTavSvhaBz70MJQ_OsBo_M1P';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const passwordInput = document.getElementById('new-password');
const updateBtn = document.getElementById('btn-update');
const messageDiv = document.getElementById('message');

// 1. Deteksi saat halaman dimuat apakah ini link reset password
supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
        console.log("Mode Pemulihan Password Aktif");
    } else if (event === "SIGNED_IN") {
        // Jika user mengklik link, mereka otomatis "signed in" untuk sementara
        console.log("User terdeteksi untuk update data");
    }
});

// 2. Logika Update Password saat tombol diklik
updateBtn.addEventListener('click', async () => {
    const newPassword = passwordInput.value;

    if (newPassword.length < 6) {
        showMessage("Password minimal 6 karakter!", "red");
        return;
    }

    updateBtn.disabled = true;
    updateBtn.innerText = "Memproses...";

    const { data, error } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (error) {
        showMessage("Gagal: " + error.message, "red");
        updateBtn.disabled = false;
        updateBtn.innerText = "Simpan Password Baru";
    } else {
        showMessage("Password berhasil diperbarui! Mengalihkan ke login...", "green");
        
        // Tunggu 2 detik lalu balik ke halaman utama
        setTimeout(() => {
            window.location.href = "../index.html";
        }, 2000);
    }
});

function showMessage(msg, color) {
    messageDiv.innerText = msg;
    messageDiv.style.color = color;
    messageDiv.style.display = "block";
}