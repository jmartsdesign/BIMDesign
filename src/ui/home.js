/**
 * Home screen: start a project from a template, open the sample, or reopen
 * a recent project.
 */
import { h, clear } from './dom.js';
import { icon } from './icons.js';

export function renderHome(app, el) {
  clear(el);
  const card = (ic, title, sub, onClick) => h('button.home-card', { type: 'button', onClick }, icon(ic, 26), h('strong', title), h('small', sub));
  el.append(
    h(
      'div.home',
      h('div', h('h1', 'BIMDesign'), h('p.home-sub', 'Modele edifícios com paredes, portas, janelas, pisos, coberturas e ambientes, depois trabalhe em plantas, cortes, elevações, 3D, tabelas e pranchas.')),
      h(
        'section',
        h('h2', 'Começar'),
        h(
          'div.home-cards',
          card('file-plus', 'Projeto métrico', 'Milímetros, plantas 1 : 100', () => app.startProject('metric')),
          card('file-plus', 'Projeto imperial', 'Pés e polegadas, plantas 1/8"', () => app.startProject('imperial')),
          card('house', 'Casa de exemplo', 'Uma pequena casa mobiliada para explorar', () => app.startProject('sample')),
          card('folder-open', 'Abrir', 'Um projeto deste dispositivo', () => app.run('open')),
        ),
      ),
      app.doc
        ? h('section', h('button.btn', { type: 'button', onClick: () => app.openView(app.doc.all('plan')[0]?.id || app.doc.all('view3d')[0]?.id) }, icon('chevron-left', 15), `Voltar para ${app.file?.name || app.doc.project.name}`))
        : null,
    ),
  );
}
