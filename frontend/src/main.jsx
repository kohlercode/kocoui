import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './theme.css';
import './styles.css';
import { render } from 'preact';
import { App } from './App.jsx';
import { initTheme } from './theme.js';

initTheme();
render(<App />, document.getElementById('app'));
