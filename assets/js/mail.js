// script.js
document.addEventListener('DOMContentLoaded', function() {
    const form = document.querySelector('.form');
    const submitButton = form.querySelector('[data-form-btn]');
  
    emailjs.init('4YEy0XOEvtNpo6eVf'); // Replace with your EmailJS user ID
  
    form.addEventListener('submit', function(event) {
      event.preventDefault();
  
      if (submitButton.disabled) return;
  
      emailjs.sendForm('service_7m4phte', 'template_eyo86th', form)
        .then((response) => {
          console.log('Sent successfully:', response);
          alert('Message sent successfully!');
        }, (error) => {
          console.error('Failed to send:', error);
          alert('Failed to send message. Please try again later.');
        });
  
      form.reset(); // Optionally reset the form after sending
    });
  
    // Enable submit button when all fields are filled
    form.addEventListener('input', function() {
      const inputs = form.querySelectorAll('input, textarea');
      const allFilled = Array.from(inputs).every(input => input.value.trim() !== '');
      submitButton.disabled = !allFilled;
    });
  });
  