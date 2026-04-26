
document.addEventListener('DOMContentLoaded',()=>{
 const nav=document.querySelector('.nav'); const toggle=document.querySelector('.mobile-toggle');
 if(toggle){toggle.addEventListener('click',()=>nav.classList.toggle('open'))}
 document.querySelectorAll('form[data-static-form]').forEach(form=>{
  form.addEventListener('submit',e=>{
   e.preventDefault();
   const box=form.querySelector('.form-message'); if(!box)return;
   const phone=form.querySelector('#phone'); const sms=form.querySelector('#smsConsent');
   if(phone && sms && phone.value.trim() && !sms.checked){
    box.className='form-message notice error';
    box.textContent='If you include a phone number, please check the SMS consent box or remove the phone number before submitting.';
    sms.focus(); return;
   }
   box.className='form-message notice success'; box.textContent=form.dataset.success || 'Thanks — your message was captured in this static demo.'; form.reset();
  });
 });
 const reg=document.querySelector('form[data-register-form]');
 if(reg){reg.addEventListener('submit',e=>{e.preventDefault(); const box=reg.querySelector('.form-message'); const ok=reg.querySelector('#smsConsent')?.checked; box.className='form-message notice '+(ok?'success':'error'); box.textContent=ok?'Static account demo: SMS verification consent captured. Connect a backend to send codes.':'You must agree to receive SMS verification codes to create an account.';});}
});
