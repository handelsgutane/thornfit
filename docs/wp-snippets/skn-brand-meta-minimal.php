<?php
/**
 * Plugin Name: SkarpeKniver — Brand Term Meta (minimal)
 * Description: Steg 1 — kun admin-UI for brand-meta. Ingen REST-felter ennå.
 *              Når denne fungerer uten å brekke, bytter vi til full versjon.
 *
 * Plassering: wp-content/mu-plugins/skn-brand-meta.php
 *
 * Hvis dette limes inn i theme/functions.php i stedet — fjern <?php-linjen øverst.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Felt-definisjoner.
 */
function skn_brand_field_keys() {
    return array(
        'skn_brand_region',
        'skn_brand_founded',
        'skn_brand_stats',
        'skn_brand_video_url',
        'skn_brand_hero_image',
    );
}

/**
 * Vis felt på "Add new brand"-skjermen.
 */
function skn_brand_add_form_fields() {
    foreach ( skn_brand_field_keys() as $key ) {
        $label = ucfirst( str_replace( array( 'skn_brand_', '_' ), array( '', ' ' ), $key ) );
        ?>
        <div class="form-field term-<?php echo esc_attr( $key ); ?>-wrap">
            <label for="<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></label>
            <?php if ( $key === 'skn_brand_stats' ) : ?>
                <textarea name="<?php echo esc_attr( $key ); ?>" id="<?php echo esc_attr( $key ); ?>" rows="3" cols="40"></textarea>
            <?php else : ?>
                <input type="text" name="<?php echo esc_attr( $key ); ?>" id="<?php echo esc_attr( $key ); ?>" value="" size="40" />
            <?php endif; ?>
        </div>
        <?php
    }
}
add_action( 'product_brand_add_form_fields', 'skn_brand_add_form_fields' );

/**
 * Vis felt på "Edit brand"-skjermen.
 */
function skn_brand_edit_form_fields( $term ) {
    foreach ( skn_brand_field_keys() as $key ) {
        $label = ucfirst( str_replace( array( 'skn_brand_', '_' ), array( '', ' ' ), $key ) );
        $value = get_term_meta( $term->term_id, $key, true );
        ?>
        <tr class="form-field term-<?php echo esc_attr( $key ); ?>-wrap">
            <th scope="row"><label for="<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></label></th>
            <td>
                <?php if ( $key === 'skn_brand_stats' ) : ?>
                    <textarea name="<?php echo esc_attr( $key ); ?>" id="<?php echo esc_attr( $key ); ?>" rows="4" cols="50"><?php echo esc_textarea( $value ); ?></textarea>
                <?php else : ?>
                    <input type="text" name="<?php echo esc_attr( $key ); ?>" id="<?php echo esc_attr( $key ); ?>" value="<?php echo esc_attr( $value ); ?>" size="40" />
                <?php endif; ?>
            </td>
        </tr>
        <?php
    }
}
add_action( 'product_brand_edit_form_fields', 'skn_brand_edit_form_fields' );

/**
 * Lagre — både ved create og update.
 */
function skn_brand_save_meta( $term_id ) {
    foreach ( skn_brand_field_keys() as $key ) {
        if ( isset( $_POST[ $key ] ) ) {
            $raw = wp_unslash( $_POST[ $key ] );
            if ( $key === 'skn_brand_stats' ) {
                update_term_meta( $term_id, $key, trim( $raw ) );
            } else {
                update_term_meta( $term_id, $key, sanitize_text_field( $raw ) );
            }
        }
    }
}
add_action( 'created_product_brand', 'skn_brand_save_meta' );
add_action( 'edited_product_brand', 'skn_brand_save_meta' );
