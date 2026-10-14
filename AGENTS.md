# Agent Rules — NxPHP

## Tujuan

Dokumen ini berisi aturan dan panduan bagi AI Agent saat bekerja pada proyek ini.

## Struktur Proyek

_(Folder proyek kosong.)_

## Commands

* `npm run test` — `echo "Error: no test specified" && exit 1`

## Aturan Utama

1. Pahami struktur proyek sebelum melakukan perubahan.
2. Jangan menghapus file atau fitur yang sudah ada tanpa alasan.
3. Pertahankan pola kode yang sudah digunakan proyek.
4. Gunakan JavaScript murni jika proyek tidak membutuhkan framework.
5. Jangan menambahkan dependency baru jika fitur dapat dibuat menggunakan dependency yang sudah tersedia.
6. Setelah melakukan perubahan, periksa kemungkinan error pada kode yang berkaitan.

## Aturan Kode

* Gunakan kode yang sederhana dan mudah dipelihara.
* Pertahankan penamaan variabel dan fungsi yang sudah digunakan.
* Jangan mengubah API publik tanpa alasan.
* Hindari kode duplikat.
* Pisahkan fungsi berdasarkan tanggung jawabnya.

## Dependency

Sebelum menambahkan package baru:

1. Periksa `package.json`.
2. Pastikan fitur tersebut belum tersedia dari dependency yang sudah digunakan.
3. Jika memang diperlukan, jelaskan alasan penambahan dependency.

## Perubahan File

Saat mengubah file:

* Baca kode yang ada terlebih dahulu.
* Ubah bagian yang diperlukan saja.
* Jangan melakukan refactor besar tanpa diminta.
* Pertahankan kompatibilitas dengan kode yang sudah ada.

## Testing

Setelah perubahan:

1. Jalankan pemeriksaan kode jika tersedia.
2. Jalankan build jika proyek memiliki build script.
3. Periksa error runtime yang mungkin muncul.
4. Pastikan fitur lama tetap bekerja.

## Prioritas

Jika terdapat konflik antara instruksi, gunakan urutan:

1. Instruksi pengguna
2. Aturan proyek
3. Struktur dan pola kode yang sudah ada
4. Praktik terbaik umum

## Larangan

Jangan:

* menghapus fitur tanpa izin;
* mengganti framework tanpa permintaan;
* menambahkan dependency secara sembarangan;
* mengubah struktur proyek secara besar-besaran tanpa alasan;
* membuat file duplikat yang sebenarnya tidak diperlukan.

## Larangan Penggunaan Subagent

AI Agent TIDAK BOLEH menggunakan subagent untuk mengerjakan tugas proyek ini. Semua pekerjaan harus dilakukan oleh main agent secara langsung. Jangan:

* membuat subagent;
* memanggil subagent;
* mendelegasikan pekerjaan ke subagent;
* menjalankan task melalui agent lain;
* membagi pekerjaan ke beberapa agent.

## Plan

Untuk tugas yang cukup besar/berisiko (menyentuh banyak file, mengubah arsitektur, operasi yang sulit dibalik):

1. Susun rencana singkat dulu (langkah-langkah, file yang akan disentuh) sebelum mulai mengubah kode.
2. Sampaikan rencana itu ke pengguna dan tunggu konfirmasi jika ada keputusan besar yang perlu dipilih (bukan sekadar detail implementasi kecil).
3. Untuk tugas kecil/jelas (perbaikan satu baris, permintaan yang sudah sangat spesifik), langsung kerjakan tanpa perlu rencana formal — jangan berlebihan.
4. Jika rencana berubah di tengah jalan, beri tahu pengguna alasannya, jangan diam-diam menyimpang dari yang sudah disepakati.
5. Untuk permintaan fitur pada satu folder/module tertentu: tulis rencana ke README.md di folder itu dulu (masalah, keputusan desain, perubahan file yang direncanakan) sebelum mengeksekusi kode — setelah selesai dan dievaluasi, tandai bagian rencana itu selesai (mis. label "SUDAH DIEKSEKUSI" atau centang ✅) di README.md yang sama, supaya riwayat keputusan tetap tercatat di folder itu sendiri.

## Git

Jika tidak ada aturan Git spesifik lain di dokumen ini:

* Sebelum operasi yang bisa menghilangkan data (reset --hard, checkout yang menimpa perubahan, clean, force push, delete branch), lakukan analisis dulu (`git status`, `git diff`, `git log`) dan tanyakan ke pengguna sebelum menjalankannya — jangan langsung eksekusi.
* Panel "Source Control" di activity bar TERPISAH dari perintah `git` di terminal — panel itu sinkron langsung ke GitHub API (push/pull/fetch), BUKAN wrapper `git push`/`git pull` biasa, dan tidak otomatis mem-commit/backup sebelum operasi terminal yang destruktif.
* Commit dengan pesan yang jelas dan menjelaskan alasan (why), bukan cuma daftar file yang diubah.
* Jangan membuat commit baru untuk memperbaiki commit sebelumnya (amend) kecuali diminta eksplisit — riwayat commit adalah milik pengguna.

## Screenshot

Referensi visual untuk memahami tampilan/perilaku UI proyek ini:

* Folder `screenshot/` di root proyek berisi tangkapan layar rujukan — periksa isinya sebelum mengerjakan tugas terkait tampilan/UI.
* File berpola nama `screenshot-001.png`, `screenshot-002.png`, dst (nomor urut 3 digit) — buka dan lihat gambar itu langsung untuk konteks visual, jangan menebak dari nama filenya saja.
* Jika tidak ada panduan visual di sini, tanyakan ke pengguna alih-alih menebak tampilan yang diharapkan.

## History

Riwayat kerja terakhir pada proyek ini (dicatat otomatis oleh IDE, bukan ditulis manual):

* `.nxcode/history/index.json` — daftar file yang paling baru diubah (terurut dari yang terbaru), tiap entri punya `path`, `lastSaved` (waktu), dan `count` (berapa kali disimpan). Periksa ini untuk menjawab "file mana yang terakhir dikerjakan".
* `.nxcode/history/timeline.json` — log linear setiap kali sebuah file disimpan (`path` + `timestamp`), bisa berisi entri berulang untuk file yang sama. Periksa ini untuk menjawab "apa saja yang terjadi belakangan ini", bukan cuma file terakhir.
* `.nxcode/history/snapshots/<nama-file-aman>/<timestamp>.snapshot` — sampai 5 salinan ISI file terakhir yang pernah tersimpan (bukan cuma metadata). Kalau pengguna minta "kembalikan ke kode sebelumnya" dan proyek ini tidak pakai git, cek folder ini dulu sebelum bilang tidak bisa — baca file `.snapshot` dengan timestamp lebih lama dari yang sekarang untuk lihat versi lampau.
* Catatan ini HANYA ada untuk file yang disimpan lewat Ctrl+S di editor IDE ini. Perubahan dari panel CLI/Terminal (perintah shell apa pun, termasuk menjalankan CLI agent seperti Claude Code langsung di terminal) TIDAK tercatat sama sekali — proses shell di situ menulis file langsung ke OS, sepenuhnya di luar jalur ini.
* IDE ini punya pemantau file terpisah yang mendeteksi perubahan dari luar (git checkout, editor lain, tool CLI eksternal) untuk file yang sedang terbuka di tab, dan pemantau folder terpisah untuk refresh Explorer — TAPI keduanya hanya untuk keperluan tampilan (reload editor / refresh tree), TIDAK menulis apa pun ke `.nxcode/history/`. Jangan asumsikan ada jalur tersembunyi yang mencatat perubahan dari luar Ctrl+S — tidak ada.
* Jika `.nxcode/history/` belum ada atau kosong, katakan terus terang bahwa belum ada catatan riwayat tersedia — jangan menebak atau mengarang riwayat kerja.
* Tidak ada fungsi/tool yang bisa dipanggil untuk MENCATAT perubahan ke History secara manual — pencatatan HANYA terjadi otomatis lewat Ctrl+S manusia di editor. Jangan mengklaim atau berasumsi ada cara memicu pencatatan ini dari tool lain.

## Prinsip AI Agent

Sebelum mengerjakan tugas:

1. Pahami permintaan.
2. Periksa file yang berkaitan.
3. Pahami dependensi dan arsitektur.
4. Tentukan perubahan minimum yang diperlukan.
5. Implementasikan perubahan.
6. Periksa hasilnya.
