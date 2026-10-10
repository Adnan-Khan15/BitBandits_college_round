/**
 * ShopLite v2 - the upstream's own redeploy.
 *
 * Same broken checkout (startChekout is still undefined), redesigned layout:
 * the checkout button moved into a fixed bottom bar and was renamed
 * checkout-btn -> cta-checkout, btn btn-primary -> button button--primary.
 */
(function () {
  'use strict';

  var money = function (amount) { return '₹' + amount.toLocaleString('en-IN'); };

  /* Cart quantity steppers: recompute line totals and the grand total. */
  var cartList = document.querySelector('ul[data-cart]');
  if (cartList) {
    var recalc = function () {
      var total = 0;
      cartList.querySelectorAll('li[data-price]').forEach(function (row) {
        var unit = Number(row.getAttribute('data-price')) || 0;
        var qtyInput = row.querySelector('.qty');
        var qty = Math.max(1, Number((qtyInput && qtyInput.value) || 1));
        var line = unit * qty;
        var lineTotal = row.querySelector('.cart-line__total');
        if (lineTotal) { lineTotal.textContent = money(line); }
        total += line;
      });
      var grand = document.querySelector('[data-grand]');
      if (grand) { grand.textContent = money(total + 99); }
      var subtotalEl = document.querySelector('[data-subtotal]');
      if (subtotalEl) { subtotalEl.textContent = money(total); }
    };
    cartList.addEventListener('input', function (event) {
      if (event.target && event.target.classList && event.target.classList.contains('qty')) {
        recalc();
      }
    });
    recalc();
  }

  /* Checkout - still broken: startChekout is undefined (same bug as v1). */
  var checkoutBtn = document.getElementById('cta-checkout');
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
