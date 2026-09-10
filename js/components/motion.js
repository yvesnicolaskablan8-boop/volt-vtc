/** Mouvements courts, sans retarder les actions ni modifier les données. */
const PiloteMotion = {
  enabled() { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
  animate(el, frames, options = {}) {
    if (!el || !el.isConnected || !this.enabled() || !el.animate) return;
    return el.animate(frames, { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)', ...options });
  },
  enter(el) { this.animate(el, [{ opacity: .5, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }]); },
  pulse(el, error = false) {
    this.animate(el, [{ boxShadow: `0 0 0 3px ${error ? '#f16b57' : '#21bb94'}88` }, { boxShadow: '0 0 0 0 transparent' }], { duration: 650 });
    if (error) this.animate(el, [{ transform:'translateX(0)' },{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:220});
  },
  capture(el) { return this.enabled() && el ? el.getBoundingClientRect() : null; },
  move(el, before, success = false) {
    if (before && el && this.enabled()) {
      const after = el.getBoundingClientRect();
      this.animate(el, [{ transform: `translate(${before.left-after.left}px,${before.top-after.top}px)`, opacity: .7 }, { transform:'translate(0,0)', opacity:1 }], { duration: 340 });
    }
    if (success) this.pulse(el);
  },
  dashboard(root) {
    if (!root) return;
    const metrics=[...root.querySelectorAll('.kpi-value,.d-val,.db-kpi-value,.db-stat-value,.iw-val,.iw-chip-val,.fd-c-val,.fd-center-val,.mini-val')];
    const next={};
    metrics.forEach((el,index)=>{const key=el.id||`${index}:${el.parentElement?.querySelector('.kpi-label,.d-lbl')?.textContent||''}`;const value=el.textContent.trim();next[key]=value;if(this._metrics&&key in this._metrics){if(this._metrics[key]!==value)this.pulse(el);}else this.animate(el,[{opacity:.4,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{delay:Math.min(index,5)*35});});
    this._metrics=next;
  }
};
