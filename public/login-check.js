const allowedEmail = 'kaisenaiko@gmail.com';
const userEmail = localStorage.getItem('userEmail');
if (userEmail !== allowedEmail) {
  window.location.href = '/auth.html';
}
