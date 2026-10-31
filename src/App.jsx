import { useEffect, useMemo, useState } from 'react';
import { Search, ShoppingBag, Heart, Menu, X, Plus, Minus, Trash2, Star, ArrowRight, CheckCircle2, SlidersHorizontal } from 'lucide-react';

const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function App() {
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('shopnova-cart') || '[]'));
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('featured');
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notice, setNotice] = useState('');
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [orderId, setOrderId] = useState(null);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');

  useEffect(() => localStorage.setItem('shopnova-cart', JSON.stringify(cart)), [cart]);
  useEffect(() => {
    fetch('/api/auth/me')
      .then(async response => {
        if (!response.ok) throw new Error('Unable to check your sign-in status.');
        const result = await response.json();
        setUser(result.user);
        setAuthMode(result.user ? '' : 'login');
      })
      .catch(error => setAuthError(error.message))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProducts() {
      try {
        const response = await fetch('/api/products', { signal: controller.signal });
        if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
        setProducts(await response.json());
      } catch (error) {
        if (error.name !== 'AbortError') setProductsError('The product catalog could not be loaded. Please try again later.');
      } finally {
        if (!controller.signal.aborted) setProductsLoading(false);
      }
    }
    loadProducts();
    return () => controller.abort();
  }, []);

  const categories = ['All', 'Electronics', 'Fashion', 'Home', 'Beauty'];
  const visibleProducts = useMemo(() => {
    let list = products.filter(p => (category === 'All' || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase()));
    if (sort === 'low') list.sort((a,b) => a.price-b.price);
    if (sort === 'high') list.sort((a,b) => b.price-a.price);
    if (sort === 'rating') list.sort((a,b) => b.rating-a.rating);
    return list;
  }, [category, query, sort]);
  const count = cart.reduce((s, item) => s + item.qty, 0);
  const subtotal = cart.reduce((s, item) => s + item.price * item.qty, 0);

  function addToCart(product) {
    setCart(old => {
      const found = old.find(i => i.id === product.id);
      return found ? old.map(i => i.id === product.id ? {...i, qty: i.qty + 1} : i) : [...old, {...product, qty: 1}];
    });
    setNotice(`${product.name} added to your bag`);
    window.setTimeout(() => setNotice(''), 2200);
  }
  function changeQty(id, delta) {
    setCart(old => old.map(i => i.id === id ? {...i, qty: i.qty + delta} : i).filter(i => i.qty > 0));
  }
  async function checkout() {
    if (!cart.length) return;
    setCheckoutPending(true);
    setCheckoutError('');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.map(({ id, qty }) => ({ id, qty })) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your demo order.');
      setOrderId(result.orderId);
      setCheckoutDone(true);
      setCart([]);
    } catch (error) {
      setCheckoutError(error.message || 'Could not save your demo order.');
    } finally {
      setCheckoutPending(false);
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthPending(true);
    setAuthError('');
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
      setUser(result.user);
      setAuthPassword('');
      setAuthMode('');
    } catch (error) {
      setAuthError(error.message || 'Unable to sign in.');
    } finally {
      setAuthPending(false);
    }
  }

  async function signOut() {
    setAuthError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to sign out. Please try again.');
      setUser(null);
      setAdminOpen(false);
    } catch (error) {
      setAuthError(error.message || 'Unable to sign out.');
    }
  }

  async function loadAdmin(offset = 0, append = false) {
    setAdminLoading(true);
    setAdminError('');
    try {
      const response = await fetch(`/api/admin/dashboard?limit=50&offset=${offset}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load the admin dashboard.');
      setAdminData(previous => append && previous
        ? { ...result, members: [...previous.members, ...result.members] }
        : result);
    } catch (error) {
      setAdminError(error.message || 'Unable to load the admin dashboard.');
    } finally {
      setAdminLoading(false);
    }
  }

  function openAdmin() {
    setAdminOpen(true);
    loadAdmin();
  }

  function formatDate(value) {
    if (!value) return 'Never';
    const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  function renderAuthPage() {
    return <section className="auth-page">
      <form className="auth-card" onSubmit={submitAuth}>
        <a className="logo" href="#" onClick={event => event.preventDefault()}>shop<span>nova</span><i>.</i></a>
        <span className="eyebrow">{authMode === 'register' ? 'JOIN SHOPNOVA' : 'WELCOME BACK'}</span>
        <h1>{authMode === 'register' ? 'Create your account' : 'Sign in to your account'}</h1>
        <p>{authMode === 'register' ? 'Save your details and enjoy a more personal shopping experience.' : 'Sign in with the email and password for your account.'}</p>
        <label>Email address<input type="email" autoComplete="email" value={authEmail} onChange={event => setAuthEmail(event.target.value)} required maxLength={254} /></label>
        <label>Password<input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={authPassword} onChange={event => setAuthPassword(event.target.value)} required minLength={8} maxLength={128} /></label>
        {authMode === 'register' && <small className="password-hint">Use at least 8 characters.</small>}
        {authError && <p className="auth-error" role="alert">{authError}</p>}
        <button className="checkout-btn" disabled={authPending}>{authPending ? 'Please wait...' : authMode === 'register' ? 'Create account' : 'Sign in'}</button>
        <p className="auth-switch">{authMode === 'register' ? 'Already have an account?' : 'New to ShopNova?'} <button type="button" onClick={() => {setAuthMode(authMode === 'register' ? 'login' : 'register');setAuthError('')}}>{authMode === 'register' ? 'Sign in' : 'Create an account'}</button></p>
      </form>
    </section>;
  }

  if (authLoading) {
    return <div className="app"><main><section className="auth-page"><div className="auth-card auth-loading"><a className="logo" href="#">shop<span>nova</span><i>.</i></a><p>Checking your sign-in...</p></div></section></main></div>;
  }

  if (!user) {
    return <div className="app"><main>{renderAuthPage()}</main></div>;
  }

  return <div className="app">
    <div className="announcement">✨ Welcome to ShopNova — free shipping on orders above ₹1,999</div>
    <header className="header">
      <button className="icon-btn mobile-only" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">{mobileMenu ? <X/> : <Menu/>}</button>
      <a className="logo" href="#" onClick={() => {setCategory('All'); setQuery('')}}>shop<span>nova</span><i>.</i></a>
      <nav className={mobileMenu ? 'nav nav-open' : 'nav'}>
        <a href="#shop" onClick={() => setCategory('All')}>Shop all</a>
        <a href="#shop" onClick={() => setCategory('Fashion')}>Fashion</a>
        <a href="#shop" onClick={() => setCategory('Electronics')}>Electronics</a>
        <a href="#shop" onClick={() => setCategory('Home')}>Home & living</a>
      </nav>
      <div className="header-actions">
        <label className="search-box"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products..." /></label>
        {user?.isAdmin && <button className="account-btn" onClick={openAdmin}>Admin</button>}
        {user ? <button className="account-btn" onClick={signOut} title={user.email}>Sign out</button> : <button className="account-btn" onClick={() => {setAuthMode('login');setAuthError('')}} disabled={authLoading}>Sign in</button>}
        <button className="bag-btn" onClick={() => {setCartOpen(true); setCheckoutDone(false); setCheckoutError('')}} aria-label="Open shopping bag"><ShoppingBag size={20}/><span>Bag</span><b>{count}</b></button>
      </div>
    </header>

    <main>
      {adminOpen ? <section className="admin-page">
        <div className="admin-heading">
          <div><span className="eyebrow">SHOPNOVA ADMIN</span><h1>Store overview</h1><p>Member activity and demo order totals.</p></div>
          <button className="primary-btn" onClick={() => setAdminOpen(false)}>Back to store</button>
        </div>
        {adminError && <p className="admin-error" role="alert">{adminError}</p>}
        {adminData && <div className="admin-stats">
          <article><span>Registered members</span><strong>{adminData.memberCount}</strong><small>Customer accounts, excluding admins</small></article>
          <article><span>Active in last 30 days</span><strong>{adminData.activeMemberCount}</strong><small>Members who signed in recently</small></article>
          <article><span>Demo orders</span><strong>{adminData.orderCount}</strong><small>Orders are not linked to member accounts</small></article>
        </div>}
        <div className="member-list">
          <div className="member-list-heading"><div><h2>Members</h2><p>Emails and account activity only. Passwords are never shown.</p></div><button className="text-btn" onClick={() => loadAdmin()}>Refresh</button></div>
          {adminLoading && !adminData ? <p>Loading member data...</p> : adminData?.members.length ? <div className="member-table-wrap"><table className="member-table">
            <thead><tr><th>Email</th><th>Joined</th><th>Last sign-in</th></tr></thead>
            <tbody>{adminData.members.map(member => <tr key={member.email}><td>{member.email}</td><td>{formatDate(member.createdAt)}</td><td>{formatDate(member.lastLoginAt)}</td></tr>)}</tbody>
          </table></div> : !adminLoading && <p>No customer accounts yet.</p>}
          {adminData && adminData.members.length < adminData.memberCount && <button className="text-btn" disabled={adminLoading} onClick={() => loadAdmin(adminData.members.length, true)}>{adminLoading ? 'Loading...' : 'Load more members'}</button>}
        </div>
      </section> : <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">THE EVERYDAY EDIT · 2026</span>
          <h1>Good things.<br/><em>Great finds.</em></h1>
          <p>Thoughtfully picked essentials for the way you live, work and play. Discover something you'll love.</p>
          <a className="primary-btn" href="#shop">Explore collection <ArrowRight size={17}/></a>
          <div className="hero-proof"><span>★★★★★</span> Loved by 2,000+ happy shoppers</div>
        </div>
        <div className="hero-image">
          <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=90" alt="Modern boutique shopping store"/>
          <div className="floating-note"><b>Curated for you</b><small>New season · New favourites</small></div>
        </div>
      </section>

      <section className="benefits">
        <div><span>↗</span><b>Free shipping</b><small>On orders above ₹1,999</small></div>
        <div><span>◇</span><b>Easy returns</b><small>7-day return window</small></div>
        <div><span>♡</span><b>Made to delight</b><small>Quality picks, fair prices</small></div>
      </section>

      <section className="shop-section" id="shop">
        <div className="section-heading"><div><span className="eyebrow">FIND YOUR FAVOURITE</span><h2>Shop the collection</h2><p>Everyday essentials, made a little more special.</p></div>
          <label className="sort-control"><SlidersHorizontal size={16}/><select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="rating">Top rated</option></select></label>
        </div>
        <div className="filters">{categories.map(c => <button key={c} className={category===c?'filter active':'filter'} onClick={() => setCategory(c)}>{c}</button>)}</div>
        <div className="result-line">{visibleProducts.length} products <span>{query && `matching “${query}”`}</span></div>
        {productsLoading ? <div className="empty-results">Loading products...</div> : productsError ? <div className="empty-results" role="alert">{productsError}</div> : <div className="product-grid">
          {visibleProducts.map(p => <article className="product-card" key={p.id}>
            <div className="product-image" style={{background:p.color}}><img src={p.image} alt={p.name} loading="lazy"/>{p.tag && <span className="product-tag">{p.tag}</span>}<button className="wish-btn" title="Wishlist demo" onClick={() => setNotice('Wishlist is a demo feature') }><Heart size={17}/></button></div>
            <div className="product-info"><div className="product-category">{p.category}</div><h3>{p.name}</h3><div className="rating"><Star size={13} fill="currentColor"/> {p.rating} <span>· In stock</span></div><div className="price-row"><b>{money(p.price)}</b><del>{money(p.oldPrice)}</del><button className="add-btn" onClick={() => addToCart(p)}><Plus size={17}/> Add</button></div></div>
          </article>)}
        </div>}
        {!productsLoading && !productsError && !visibleProducts.length && <div className="empty-results"><Search size={28}/><h3>No products found</h3><p>Try another search or category.</p><button className="text-btn" onClick={() => {setQuery('');setCategory('All')}}>Clear filters</button></div>}
      </section>

      <section className="newsletter"><div><span className="eyebrow">A LITTLE GOOD NEWS</span><h2>Fresh finds, straight to your inbox.</h2><p>Get updates on new arrivals and special offers.</p></div><form onSubmit={e => {e.preventDefault();setNotice('Thanks for subscribing! (Demo only)')}}><input type="email" placeholder="Your email address" required/><button>Join us <ArrowRight size={16}/></button></form></section>
      </>}
    </main>

    <footer><a className="logo" href="#">shop<span>nova</span><i>.</i></a><p>Everyday finds, better prices.</p><small>© 2026 ShopNova. Demo shopping website built for learning and internship deployment.</small></footer>

    {notice && <div className="toast"><CheckCircle2 size={18}/>{notice}</div>}
    {cartOpen && <div className="overlay" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={e => e.stopPropagation()}>
      <div className="drawer-head"><div><span className="eyebrow">YOUR PICKS</span><h2>Shopping bag ({count})</h2></div><button className="icon-btn" onClick={() => setCartOpen(false)}><X/></button></div>
      {checkoutDone ? <div className="checkout-success"><CheckCircle2 size={44}/><h3>Demo order saved</h3><p>Order #{orderId} was saved. This is a demo only; no payment was collected.</p><button className="primary-btn" onClick={() => {setCheckoutDone(false);setCartOpen(false)}}>Continue shopping</button></div> : <>
        <div className="cart-items">{cart.length ? cart.map(item => <div className="cart-item" key={item.id}><img src={item.image} alt=""/><div className="cart-item-info"><b>{item.name}</b><strong>{money(item.price)}</strong><div className="qty"><button onClick={() => changeQty(item.id,-1)}><Minus size={13}/></button><span>{item.qty}</span><button onClick={() => changeQty(item.id,1)}><Plus size={13}/></button><button className="remove" onClick={() => changeQty(item.id,-item.qty)}><Trash2 size={14}/></button></div></div></div>) : <div className="empty-cart"><ShoppingBag size={36}/><h3>Your bag is empty</h3><p>Add something lovely from the collection.</p></div>}</div>
        <div className="cart-bottom"><div className="subtotal"><span>Subtotal</span><b>{money(subtotal)}</b></div><small>Shipping and taxes calculated at checkout.</small>{checkoutError && <p role="alert">{checkoutError}</p>}<button className="checkout-btn" disabled={!cart.length || checkoutPending} onClick={checkout}>{checkoutPending ? 'Saving order...' : 'Checkout demo'} <ArrowRight size={17}/></button><p className="demo-note">Demo only · No real payment processing</p></div>
      </>}
    </aside></div>}
  </div>;
}
