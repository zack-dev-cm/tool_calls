const allowedEmail = 'kaisenaiko@gmail.com';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('email-input');
    const email = emailInput.value.trim();
    if (email === allowedEmail) {
      localStorage.setItem('userEmail', email);
      window.location.href = '/';
    } else {
      alert('Unauthorized user');
    }
  });
});
