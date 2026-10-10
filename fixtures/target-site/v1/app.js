/**
 * ShopLite v1 - the original app.
 *
 * Contains the bug PATCHWORK demoes around: clicking the checkout button calls
 * startChekout(), which is not defined anywhere in this file. The browser throws
 * a ReferenceError and nothing happens.
 */
(function () {
  'use strict';

  var money = function (amount) { return '₹' + amount.toLocaleString('en-IN'); };

  /* Cart quantity steppers: recompute line totals and the grand total. */
  var cartBody = document.querySelector('tbody[data-cart]');
  if (cartBody) {
    var recalc = function () {
      var subtotal = 0;
      cartBody.querySelectorAll('tr[data-price]').forEach(function (row) {
        var unit = Number(row.getAttribute('data-price')) || 0;
        var qtyInput = row.querySelector('.qty');
        var qty = Math.max(1, Number((qtyInput && qtyInput.value) || 1));
        var line = unit * qty;
        var lineTotal = row.querySelector('.line-total');
        if (lineTotal) { lineTotal.textContent = money(line); }
        subtotal += line;
      });
      var shipping = subtotal > 0 ? 99 : 0;
      var setText = function (selector, value) {
        var el = document.querySelector(selector);
        if (el) { el.textContent = value; }
      };
      setText('[data-subtotal]', money(subtotal));
      setText('[data-shipping]', money(shipping));
      setText('[data-grand]', money(subtotal + shipping));
    };
    cartBody.addEventListener('input', function (event) {
      if (event.target && event.target.classList && event.target.classList.contains('qty')) {
        recalc();
      }
    });
    recalc();
  }

  /* Checkout - broken on purpose: startChekout is undefined. */
  var checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', function () {
      startChekout();
    });
  }

  /* Checkout page: place order. */
  var checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', function (event) {
      event.preventDefault();
      window.location.assign('/order/success');
    });
  }
})();
